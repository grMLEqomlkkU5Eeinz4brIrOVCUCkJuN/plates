# SimpleBackend

A Spring Boot REST service over Postgres. One resource, `users`, is implemented end to
end as the example to copy.

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
startup naming the variable.

The tests (`./mvnw verify`) start their own Postgres with Testcontainers, so they need a
working Docker daemon. They run against a real database because what they check (the
unique constraints, the optimistic locking UPDATE, the migration) only exists there.

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
`ErrorCode`; adding one changes the contract.

## Before you extend this

- Listing is keyset paginated: `?after=<last id you saw>`. Offsets shift under
  concurrent inserts and deletes, so a client paging through a growing table sees rows
  twice or skips them. There is no total count (a second scan per request) and no
  arbitrary `sort` (a caller could make the database sort by any column).

- Only `service` touches `repository`. `UserController` holds no query.
  `UserRepository` extends `Repository`, not `JpaRepository`, so `findAll()` and the
  other unbounded methods do not exist.

- The entity stops at the service. Controllers take and return records from `dto`,
  never a `User`. A caller cannot set `id` or `version` because no request record
  declares them, and an unknown field is a 400. Packaging by layer means `User` has to
  be public, so the compiler does not enforce this: returning an entity from a
  controller compiles.

- Usernames and emails are lowercased and trimmed before they are written, so the
  unique constraints reject `Alice@example.com` once `alice@example.com` exists. The
  normalising in the service and the constraint in the database go together; changing
  one alone reopens the hole.

- Writes are guarded by a version column. Send `If-Match: "<etag>"` on an update to get
  412 when someone else has changed the row since you read it. Two updates that race
  past that check are still separated at the database and the loser gets 409
  (`UserControllerConcurrencyTest`).

- Readiness includes the database, liveness does not. A Postgres outage should take
  instances out of the load balancer, not restart all of them while Postgres is already
  struggling.

- Health and info live on port 8081, so they can be firewalled off without a path rule
  on the public listener. Compose does not publish it.

- The rate limiter is per instance. It protects one process from one noisy caller.
  Behind N instances a caller gets N times the allowance, and a restart forgets every
  bucket. For an exact quota, put a limiter at the edge.

- `X-Forwarded-For` is not trusted by default. The client writes it unless a proxy you
  control overwrites it, and trusting it gives a caller a new rate limit bucket per
  request. Turn on `api.rate-limit.trust-forwarded-for` only once every request comes
  through such a proxy, and set `server.forward-headers-strategy` at the same time.

- Request bodies are capped at `api.max-request-body-bytes`. Tomcat's own limit covers
  form encoded bodies only, which would leave JSON unbounded.

- Request bodies are never logged, and Hibernate's SQL warning logger is turned down
  because it repeats the column value that broke a constraint. A duplicate email is an
  expected 409 and does not put the address in the log. An integrity failure the
  service does not expect is logged in full with the database's message, which can
  carry a value.

- Migrations are Flyway, and `ddl-auto` is `validate`. Hibernate never changes the
  schema; it refuses to start when the schema and the entity disagree. Write migrations
  the previous version of the service can still run against, and add a column before
  you start writing to it.

## Not included

No authentication and no authorization, not even a partial version: `users` here is a
plain resource, not an identity, and every row is readable by anything that can reach the
port. Before this faces
anything untrusted you need Spring Security, a decision about what a principal
is, and an ownership check at the query in `UserService` rather than a filter in
front of it.

Also absent, because each depends on your deployment: TLS (terminate it upstream), a
background job runner, outbound HTTP clients and their timeouts, metrics beyond what
Actuator gives you, and multi-tenancy.
