# SimpleBackend

A Spring Boot REST service over Postgres, set up the way a service that holds
other people's data has to be set up. One resource, `users`, is implemented end
to end as the worked example to copy.

Spring Boot 4.1, Java 25, Postgres 17, Flyway, Hibernate.

## Running it

```
cp .env.example .env     # then fill in POSTGRES_PASSWORD
docker compose up --build
```

The API is on `http://localhost:8080`. Interactive docs are at `/docs` and the
OpenAPI document at `/openapi.json`, both off under the `prod` profile.

Against a Postgres you already have:

```
export DB_URL=jdbc:postgresql://localhost:5432/simplebackend
export DB_USERNAME=simplebackend
export DB_PASSWORD=...
./mvnw spring-boot:run
```

There are no defaults for those three. A deploy that forgets one stops at
startup naming the variable rather than quietly connecting somewhere else.

## Tests

```
./mvnw verify
```

The suite starts its own Postgres with Testcontainers, so it needs a working
Docker daemon and nothing else. Tests run against the real database because
what they check (the unique constraints, the optimistic locking UPDATE, the
migration) does not exist anywhere else.

## Layout

Packages are layers, so a change of one kind lives in one place.

```
config/      settings bound and validated at startup, CORS, the Clock bean
controller/  HTTP in and out: status codes, headers, no queries
service/     transactions, normalisation, the only code that uses a repository
repository/  Spring Data interfaces, narrowed to the queries actually needed
model/       JPA entities
dto/         request and response records, the shape callers see
exception/   ErrorCode, ApiException and the one handler that renders them
filter/      request id, rate limit, body size cap
```

## The API

| Method | Path                  | Notes                                     |
|--------|-----------------------|-------------------------------------------|
| POST   | `/api/v1/users`       | 201 with `Location` and `ETag`            |
| GET    | `/api/v1/users`       | `?after=<id>&limit=<1..100>`              |
| GET    | `/api/v1/users/{id}`  | `ETag` carries the version                |
| PUT    | `/api/v1/users/{id}`  | optional `If-Match`                       |
| DELETE | `/api/v1/users/{id}`  | 204 whether or not it was there           |

Every failure is an RFC 9457 problem document with the same shape:

```json
{
  "status": 409,
  "title": "Email already registered",
  "detail": "That email is already registered",
  "instance": "/api/v1/users",
  "code": "EMAIL_TAKEN",
  "requestId": "bd6f1c2e-2a5f-4a9c-9f6e-1c0f2f2a7d31"
}
```

Branch on `code`, never on `title` or `detail`. The set of codes is
`ErrorCode`; adding one is a deliberate change to the contract.

## Decisions worth knowing before you extend this

**Listing is keyset paginated, not offset.** `?after=<last id you saw>`. Offsets
shift under concurrent inserts and deletes, so a client paging through a growing
table sees rows twice or skips them. There is no total count and no arbitrary
`sort`: the first costs a second scan per request, the second lets a caller sort
by any column and hands them a way to make the database work for free.

**Only `service` touches `repository`.** `UserController` holds no query.
`UserRepository` extends `Repository`, not `JpaRepository`, so `findAll()` and
the rest of the unbounded methods do not exist to be reached for.

**The entity stops at the service.** Controllers take and return records from
`dto`, never a `User`. A caller cannot set `id` or `version` because no request
record declares them, and an unknown field is a 400 rather than something
silently dropped. Packaging by layer means `User` has to be public, so this one
is a rule the compiler will not enforce for you: returning an entity from a
controller compiles.

**Usernames and emails are lowercased and trimmed before they are written**, so
the unique constraints reject `Alice@example.com` once `alice@example.com`
exists. Normalising in the service and constraining in the database are one
decision; changing either alone reopens the hole.

**Writes are guarded by a version column.** Send `If-Match: "<etag>"` on an
update to be told 412 when someone else has moved the row since you read it.
Two updates that race past that check are still separated at the database and
the loser gets 409. `UserControllerConcurrencyTest` is the proof.

**Health is split.** Readiness includes the database, liveness does not. A
Postgres outage should take instances out of the load balancer, not restart
every one of them while Postgres is already struggling.

**Health and info live on port 8081**, so they can be firewalled off without a
path rule on the public listener. Compose does not publish it.

**The rate limiter is per instance.** It protects one process from one noisy
caller. Behind N instances a caller gets N times the allowance, and a restart
forgets every bucket. If you need an exact quota, put a real limiter at the
edge; this one is the floor, not the ceiling.

**`X-Forwarded-For` is not trusted by default.** It is written by the client
unless a proxy you control overwrites it, and trusting it means a caller can
have a new rate limit bucket per request. Turn on
`api.rate-limit.trust-forwarded-for` only once every request reaches this
service through such a proxy, and set `server.forward-headers-strategy` at the
same time.

**Request bodies are capped** at `api.max-request-body-bytes`. Tomcat's own
limit covers form encoded bodies only, which would leave JSON unbounded.

**Request bodies are never logged, and Hibernate's SQL warning logger is turned
down** because it repeats the column value that broke a constraint. A duplicate
email is an expected 409 and does not put the address in the log. An integrity
failure the service does not expect is a defect, and that one is logged in full
with the database's own message, which can carry a value.

**Migrations are Flyway, and `ddl-auto` is `validate`.** Hibernate never changes
the schema; it refuses to start when the schema and the entity disagree. Write
migrations that the previous version of the service can still run against, and
add a column before you start writing to it.

## Not included

No authentication and no authorization. There is deliberately no half-built
version of either: `users` here is a plain resource, not an identity, and every
row is world readable to anything that can reach the port. Before this faces
anything untrusted you need Spring Security, a decision about what a principal
is, and an ownership check at the query in `UserService` rather than a filter in
front of it.

Also absent, because none of it can be written honestly without knowing your
deployment: TLS (terminate it upstream), a background job runner, outbound HTTP
clients and their timeouts, metrics beyond what Actuator gives you, and
multi-tenancy.
