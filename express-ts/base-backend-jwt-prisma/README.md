# Express TypeScript Backend Template (JWT + Prisma)

A simple Express.js backend template with TypeScript, JWT authentication, CSRF protection, Zod validation, Winston logging, Swagger docs and Jest testing, storing its data in PostgreSQL through [Prisma](https://www.prisma.io) 7.

This is [`base-backend-jwt`](../base-backend-jwt) with a real datastore behind it. Everything about auth, cookies and CSRF is unchanged; what changed is that `users` is a table rather than a `Map` that empties itself on restart.

## Quick Start

```bash
# Install dependencies (also generates the Prisma client and installs the git hooks)
npm install

# Start Postgres for development, or point DATABASE_URL at one you already have
docker compose up -d db

# Create the tables
npm run db:migrate

# Development - watch mode (node --watch), auto-loads .env.development
npm run dev

# Run tests (no database needed - see "Testing without a database")
npm test

# Build and run for production (prod config: see .env.production.example)
npm run build
npm start
```

## The database

### Where each piece lives

| File | Owns |
| --- | --- |
| `prisma/schema.prisma` | The shape of the data. Models, columns, indexes. |
| `prisma.config.ts` | The connection. Prisma 7 keeps the URL out of the schema, and does not read `.env` files by itself - this file hands `DATABASE_URL` to the CLI through Node's own `process.loadEnvFile`, the same file `npm run dev` loads. |
| `prisma/migrations/` | The history. One folder of SQL per change, committed. |
| `src/generated/prisma/` | The client `prisma generate` writes. **Gitignored** - `npm install` and `npm run db:migrate` regenerate it. |
| `src/db/prisma.ts` | The single `PrismaClient` for the process, and the boot-time connection check. |

### Changing the schema

```bash
# edit prisma/schema.prisma, then
npm run db:migrate          # names and applies a migration, regenerates the client
```

`npm run db:deploy` (`prisma migrate deploy`) is the production counterpart: it applies committed migrations and creates nothing new. Run it as its own release step, **before** the new version starts serving. The app does not migrate on boot, and the Dockerfile does not either - two replicas racing to migrate the same database is a worse problem than an extra deploy stage.

### One client, one pool

`src/db/prisma.ts` exports a single client because each `PrismaClient` owns a connection pool. Prisma 7 has no query engine binary: it talks to Postgres through the [`@prisma/adapter-pg`](https://www.prisma.io/docs/orm/overview/databases/postgresql) driver adapter, so the pool is node-postgres' and `DATABASE_POOL_MAX` is what sizes it.

That number is **per process**. Four replicas at the default of 10 hold forty connections, and Postgres counts all of them against `max_connections`. Size it against your replica count, or put PgBouncer in between.

### Prisma errors become status codes

`middleware/errorHandler.ts` translates the failures that are the client's fault. Everything else stays a 500, because a connection failure is not something the caller can fix:

| Code | Status | Meaning |
| --- | --- | --- |
| `P2000` | 400 | Value too long for the column |
| `P2002` | 409 | Unique constraint (a duplicate email) |
| `P2003` | 409 | Foreign key constraint |
| `P2011` | 400 | Null constraint |
| `P2025` | 404 | Record required but not found |

The response carries our message, not Prisma's: `err.message` names the model, the constraint and often the offending value. The original still goes to the log, alongside the `prismaCode`.

This is what lets the controllers stay free of `try`/`catch`. `updateUserHandler` calls `prisma.user.update` on an id that may not exist and lets P2025 become the 404 - no read-then-write, and no window between the two for another request to delete the row.

## Project Structure

```
.
├── docker-compose.yml
├── Dockerfile
├── eslint.config.mjs
├── jest.config.ts
├── package.json
├── package-lock.json
├── prisma
│   ├── migrations
│   │   ├── 20260906000000_init
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── prisma.config.ts
├── README.md
├── src
│   ├── app.ts
│   ├── config
│   │   ├── env.ts
│   │   └── swagger.ts
│   ├── controllers
│   │   ├── auth.controller.ts
│   │   ├── health.controller.ts
│   │   └── user.controller.ts
│   ├── db
│   │   ├── __mocks__
│   │   │   └── prisma.ts
│   │   └── prisma.ts
│   ├── generated            # prisma generate output, gitignored
│   ├── main.ts
│   ├── middleware
│   │   ├── auth.ts
│   │   ├── csrf.ts
│   │   ├── errorHandler.ts
│   │   ├── httpLogger.ts
│   │   └── validate.ts
│   ├── models
│   │   ├── __tests__
│   │   │   └── user.model.test.ts
│   │   └── user.model.ts
│   ├── routes
│   │   ├── api
│   │   │   └── v1
│   │   │       ├── auth.routes.ts
│   │   │       ├── health.routes.ts
│   │   │       ├── index.ts
│   │   │       ├── __tests__
│   │   │       │   ├── health.routes.test.ts
│   │   │       │   └── user.routes.test.ts
│   │   │       └── user.routes.ts
│   │   └── index.ts
│   ├── test
│   │   ├── app.ts
│   │   ├── auth.ts
│   │   ├── env.ts
│   │   └── setup.ts
│   ├── types
│   │   ├── express.d.ts
│   │   └── README.md
│   └── utils
│       ├── helpers.ts
│       └── logger.ts
├── tsconfig.build.json
└── tsconfig.json
```

## Adding a New Feature

This guide walks through adding a "Product" feature as an example.

### Step 1: Add the model and migrate

Add to `prisma/schema.prisma`:

```prisma
model Product {
	id        String   @id @default(uuid()) @db.Uuid
	name      String
	price     Decimal  @db.Decimal(10, 2)
	createdAt DateTime @default(now())
	updatedAt DateTime @updatedAt

	@@map("products")
}
```

Then:

```bash
npm run db:migrate
```

That writes `prisma/migrations/<timestamp>_add_product/migration.sql`, applies it, and regenerates the client so `prisma.product` exists and is typed.

### Step 2: Create the validation schema

Create `src/models/product.model.ts`:

```typescript
import { z } from "zod";
import type { Product } from "../generated/prisma/client";

// The schema owns the row; zod owns what a client is allowed to send.
export type ProductData = Product;

export const productSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1).max(200),
	price: z.number().positive(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

// The database fills these in, so a client that sends them is ignored.
export const createProductSchema = productSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});
export const updateProductSchema = createProductSchema.partial();

export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductData = z.infer<typeof updateProductSchema>;
```

`user.model.ts` adds `satisfies z.ZodType<UserData>` to its row schema, which stops compiling the moment the Prisma model and the zod object disagree. Do the same here once the two describe the same types - `Decimal` is one of the columns where they do not, which is why it is missing above.

### Step 3: Create the Controller

Create `src/controllers/product.controller.ts`:

```typescript
import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { CreateProductData, UpdateProductData } from "../models/product.model";
import { createError } from "../middleware/errorHandler";

// Express 5 forwards a rejected promise to the error middleware by itself, so
// these need no wrapper - and no try/catch: errorHandler.ts turns P2025 into a
// 404 and P2002 into a 409.
export const createProductHandler = async (
	req: Request,
	res: Response
): Promise<void> => {
	const product = await prisma.product.create({
		data: req.body as CreateProductData,
	});

	res.status(201).json(product);
};

export const getProducts = async (
	_req: Request,
	res: Response
): Promise<void> => {
	res.json(await prisma.product.findMany({ orderBy: { createdAt: "asc" } }));
};

export const getProductById = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	const product = await prisma.product.findUnique({
		where: { id: req.params.id },
	});
	if (!product) throw createError(404, "Product not found");

	res.json(product);
};

export const updateProductHandler = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	const product = await prisma.product.update({
		where: { id: req.params.id },
		data: req.body as UpdateProductData,
	});

	res.json(product);
};

export const deleteProduct = async (
	req: Request<{ id: string }>,
	res: Response
): Promise<void> => {
	await prisma.product.delete({ where: { id: req.params.id } });

	res.status(204).send();
};
```

### Step 4: Create the Routes

Create `src/routes/api/v1/product.routes.ts`:

```typescript
import { Router } from "express";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import {
	createProductSchema,
	updateProductSchema,
} from "../../../models/product.model";
import {
	createProductHandler,
	getProducts,
	getProductById,
	updateProductHandler,
	deleteProduct,
} from "../../../controllers/product.controller";

const router = Router();

const idParamSchema = {
	params: z.object({
		id: z.string().uuid("Invalid product ID"),
	}),
};

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", authenticate, getProducts);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created
 *       409:
 *         description: Conflicts with an existing row
 */
router.post(
	"/",
	authenticate,
	doubleCsrfProtection,
	validate({ body: createProductSchema }),
	createProductHandler
);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: Product not found
 */
router.get("/:id", authenticate, validate(idParamSchema), getProductById);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.patch(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate({ ...idParamSchema, body: updateProductSchema }),
	updateProductHandler
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate(idParamSchema),
	deleteProduct
);

export default router;
```

### Step 5: Register the Routes

Update `src/routes/api/v1/index.ts`:

```typescript
import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import productRoutes from "./product.routes"; // Add this

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/products", productRoutes); // Add this

export default router;
```

### Step 6: Add Tests

Schema tests need nothing new - `src/models/__tests__/user.model.test.ts` is the pattern, and it is pure zod.

Route tests reach the database, so they mock it. `src/db/__mocks__/prisma.ts` is the manual mock Jest picks up; extend it with a `product` delegate the same way `user` is written:

```typescript
import request from "supertest";
import { jest } from "@jest/globals";
import { createTestApp } from "../../../../test/app";

jest.mock("../../../../db/prisma");

describe("Product Routes", () => {
	const app = createTestApp();

	describe("POST /api/v1/products", () => {
		it("should create a product", async () => {
			const response = await request(app)
				.post("/api/v1/products")
				.send({ name: "Test", price: 10 });

			expect(response.status).toBe(201);
			expect(response.body.name).toBe("Test");
		});
	});
});
```

Once the fake starts doing more than a `Map` can honestly do, stop extending it and point the suite at a real database instead - see below.

### Step 7: Run Tests

```bash
npm test
```

## Testing without a database

`npm test` needs no Postgres. The route suites carry `jest.mock(".../db/prisma")`, and `src/db/__mocks__/prisma.ts` answers with an in-memory store that raises the two Prisma errors which decide a status code: `P2002` for a duplicate unique value, `P2025` for a row that is not there. So the 409 and 404 paths are exercised by the same error type the driver raises.

What that does not test is a query. `findUnique` in the fake is a `Map` lookup, not SQL, so it will happily agree with a `where` clause Postgres would reject.

When the schema grows past `User`, run the real thing:

1. Point `DATABASE_URL` at a throwaway database - `docker compose up -d db`, or [Testcontainers](https://node.testcontainers.org) for one per run.
2. `npm run db:deploy` into it.
3. Drop the `jest.mock` line from the suites that should hit it, and truncate between tests.

## Environment Variables

`config/env.ts` validates these with zod at startup. `npm run dev` loads `.env.development`, `npm start` loads `.env.production` - both through Node's native `--env-file-if-exists`, so the file is optional and a real environment variable always wins over it. `prisma.config.ts` loads the same file for the CLI, so migrations and the app never disagree about which database they mean. Keys with a default below can be omitted.

| Variable             | Default                             | Description                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------ |
| `NODE_ENV`           | `development`                       | Environment mode                                 |
| `PORT`               | `3000`                              | Server port                                      |
| `LOG_LEVEL`          | `info`                              | Winston log level                                |
| `SERVICE_NAME`       | `jwt-prisma-backend`                | Service name for logs                            |
| `DATABASE_URL`       | (required)                          | PostgreSQL connection string                     |
| `DATABASE_POOL_MAX`  | `10`                                | Connections held by **this process**             |
| `CORS_ORIGIN`        | `*`                                 | Allowed origins (comma-separated)                |
| `CORS_METHODS`       | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Allowed methods                                  |
| `CORS_CREDENTIALS`   | `true`                              | Allow credentials                                |
| `JWT_SECRET`         | (required)                          | Secret for signing access tokens (min 32 chars)  |
| `JWT_REFRESH_SECRET` | (required)                          | Secret for signing refresh tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRY`  | `15m`                               | Access token lifetime                            |
| `JWT_REFRESH_EXPIRY` | `7d`                                | Refresh token lifetime                           |
| `COOKIE_SECRET`      | (required)                          | Secret for signing cookies (min 32 chars)        |
| `COOKIE_SECURE`      | `true`                              | Set secure flag on cookies                       |
| `COOKIE_SAME_SITE`   | `strict`                            | SameSite cookie attribute                        |
| `COOKIE_DOMAIN`      | (unset)                             | Parent domain for the session and CSRF cookies. Unset leaves them host-only |
| `CSRF_SECRET`        | (required)                          | Secret for CSRF token generation (min 32 chars)  |

Unset, `COOKIE_DOMAIN` leaves every cookie host-only: only the host that set it
gets it back, which is right on localhost and behind a single hostname. Once
more than one of your hosts has to see the session, set the shared parent.
`middleware/csrf.ts` HMACs each CSRF token against the access-token cookie, so
the two need the same scope: where the CSRF cookie does not reach, valid
requests fail the check with a 403 and no part of the error mentions cookies. A
`Domain` cookie also goes to every subdomain underneath, including any you do
not run, so name the narrowest parent that covers your hosts.

## Available Scripts

| Script                  | Description           |
| ----------------------- | --------------------- |
| `npm run dev`           | Watch mode (node --watch); loads `.env.development` |
| `npm run build`         | Compile TypeScript    |
| `npm start`             | Run the build; loads `.env.production` |
| `npm test`              | Run all tests         |
| `npm run test:watch`    | Watch mode            |
| `npm run test:coverage` | With coverage         |
| `npm run db:migrate`    | Create and apply a migration in development |
| `npm run db:deploy`     | Apply committed migrations (production) |
| `npm run db:generate`   | Regenerate the Prisma client |
| `npm run db:reset`      | Drop, recreate and re-migrate the development database |
| `npm run db:studio`     | Prisma Studio, a browser UI over the data |

`npm install` runs `db:generate` for you (`postinstall`), which is why the generated client can stay out of git.

## API Documentation

Swagger UI available at `http://localhost:3000/docs` when the server is running.

## Key Patterns

### Error Handling

Use `createError` from `http-errors` for operational errors:

```typescript
import { createError } from "../middleware/errorHandler";

throw createError(404, "Resource not found");
throw createError(400, "Invalid input");
```

Prisma's own errors do not need catching - the table above is applied in
`errorHandler.ts`. Catch one only when you want different behaviour, such as
upserting on a duplicate rather than returning 409.

### Validation

Use Zod schemas with the `validate` middleware:

```typescript
import { validate } from "../middleware/validate";

router.post("/", validate({ body: createSchema }), handler);
router.get("/:id", validate({ params: idSchema }), handler);
router.get("/", validate({ query: filterSchema }), handler);
```

`validate` replaces `req.body` with the parsed value, so a field the schema does
not mention never reaches `prisma.create`.

### Authentication

Protected routes use the `authenticate` middleware. State-changing routes also need CSRF protection:

```typescript
import { authenticate } from "../middleware/auth";
import { doubleCsrfProtection } from "../middleware/csrf";

// Read-only, requires login
router.get("/", authenticate, handler);

// State-changing, requires login + CSRF token
router.post("/", authenticate, doubleCsrfProtection, handler);
```

The CSRF token is HMAC-bound to the access-token cookie, so it stops validating the moment
that cookie rotates. Login and refresh both return a fresh `csrfToken` in the response
body; a client that caches the one from login gets 403s from the first refresh onward, at
`JWT_ACCESS_EXPIRY` old. Read it from each response rather than storing it once.

A second cookie of the same name is refused rather than resolved. Any host under
`COOKIE_DOMAIN` can set `access_token`, browsers send both copies, and nothing says which
wins, so `authenticate` treats a duplicated name as no session at all.

### Logging

Use the Winston logger:

```typescript
import logger from "../utils/logger";

logger.info("Server started", { port: 3000 });
logger.error("Failed to connect", { error: err.message });
```

## Before production

[`../PRODUCTION.md`](../PRODUCTION.md) is the list of what these templates deliberately do
not do - rate limiting, TLS, a shared revocation store - which of those your platform
probably handles for you, and a short list of things that are simply bugs. Read it before
the first deploy, not after.

Its first item, "nothing is persisted", is the one this template answers. The second is
not: `login` in `controllers/auth.controller.ts` still invents a user for any email and
password given to it. There is now a `users` table to check credentials against, and
nothing checks them - add a `passwordHash` column, hash with argon2id, and compare in
constant time even for an email nobody has registered.

Three more that are specific to running Prisma here:

- **Migrations are a release step, not a boot step.** `npm run db:deploy`, once, before the
  new version serves traffic. `prisma migrate deploy` needs the CLI, which is a
  devDependency and is deliberately not in the production image.
- **`DATABASE_POOL_MAX` is per process.** Replicas multiply it, Postgres counts the total,
  and the failure mode is `too many clients already` under exactly the load you added
  replicas for.
- **`/health` does not touch the database.** `getHealth` returns `{ status: "ok" }` without
  a query, which makes it a liveness probe. A readiness probe should run something like the
  `SELECT 1` in `db/prisma.ts` - otherwise pods report healthy while every request that
  needs a row fails.
