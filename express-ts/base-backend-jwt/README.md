# Express TypeScript Backend Template (JWT)

A simple Express.js backend template with TypeScript, JWT authentication, CSRF protection, Zod validation, Winston logging, OpenAPI docs generated from the zod schemas, and Jest testing. Not specific to any tech stack.

## Quick Start

```bash
# Install dependencies
npm install

# Development - watch mode (node --watch), auto-loads .env.development
npm run dev

# Run tests
npm test

# Build and run for production (prod config: see .env.production.example)
npm run build
npm start
```

## Project Structure

```
.
├── Dockerfile
├── eslint.config.mjs
├── jest.config.ts
├── openapi.json
├── package.json
├── package-lock.json
├── README.md
├── src
│   ├── app.ts
│   ├── config
│   │   └── env.ts
│   ├── controllers
│   │   ├── auth.controller.ts
│   │   ├── health.controller.ts
│   │   └── user.controller.ts
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
│   │   ├── auth.model.ts
│   │   └── user.model.ts
│   ├── openapi
│   │   ├── __tests__
│   │   │   └── openapi.test.ts
│   │   ├── document.ts
│   │   ├── index.ts
│   │   ├── paths
│   │   │   ├── auth.ts
│   │   │   ├── health.ts
│   │   │   └── users.ts
│   │   ├── registry.ts
│   │   └── responseCheck.ts
│   ├── routes
│   │   ├── api
│   │   │   └── v1
│   │   │       ├── auth.routes.ts
│   │   │       ├── health.routes.ts
│   │   │       ├── index.ts
│   │   │       ├── __tests__
│   │   │       │   ├── auth.routes.test.ts
│   │   │       │   ├── health.routes.test.ts
│   │   │       │   └── user.routes.test.ts
│   │   │       └── user.routes.ts
│   │   └── index.ts
│   ├── scripts
│   │   └── openapi.ts
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
└── tsconfig.json
```

## Adding a New Feature

This guide walks through adding a "Product" feature as an example.

### Step 1: Create the Model

Create `src/models/product.model.ts`:

```typescript
import { z } from "zod";

// Define schemas
export const productSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200),
	price: z.number().positive(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const createProductSchema = productSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export const updateProductSchema = createProductSchema.partial();

export const productIdParamsSchema = z.object({
	id: z.uuid("Invalid product ID"),
});

export const listProductsQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

// Derive types from schemas
export type ProductData = z.infer<typeof productSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductData = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Factory function
export const createProduct = (data: CreateProductData): ProductData => {
	const now = new Date();
	return {
		id: crypto.randomUUID(),
		...data,
		createdAt: now,
		updatedAt: now,
	};
};

// Immutable update
export const updateProduct = (
	product: ProductData,
	data: UpdateProductData
): ProductData => ({
	...product,
	...data,
	updatedAt: new Date(),
});
```

### Step 2: Create the Controller

Create `src/controllers/product.controller.ts`:

```typescript
import { Request, Response } from "express";
import {
	createProduct,
	updateProduct,
	CreateProductData,
	UpdateProductData,
	ProductData,
	ListProductsQuery,
} from "../models/product.model";
import { createError } from "../middleware/errorHandler";

// Replace with your database
const products = new Map<string, ProductData>();

export const createProductHandler = (req: Request, res: Response) => {
	const product = createProduct(req.body as CreateProductData);
	products.set(product.id, product);
	res.status(201).json(product);
};

export const getProducts = (req: Request, res: Response) => {
	// validate() has replaced req.query with listProductsQuerySchema's output.
	const { limit, offset } = req.query as unknown as ListProductsQuery;
	res.json({
		items: products.values().drop(offset).take(limit).toArray(),
		total: products.size,
		limit,
		offset,
	});
};

export const getProductById = (req: Request<{ id: string }>, res: Response) => {
	const product = products.get(req.params.id);
	if (!product) throw createError(404, "Product not found");
	res.json(product);
};

export const updateProductHandler = (
	req: Request<{ id: string }>,
	res: Response
) => {
	const product = products.get(req.params.id);
	if (!product) throw createError(404, "Product not found");

	const updated = updateProduct(product, req.body as UpdateProductData);
	products.set(updated.id, updated);
	res.json(updated);
};

export const deleteProduct = (req: Request<{ id: string }>, res: Response) => {
	if (!products.delete(req.params.id))
		throw createError(404, "Product not found");
	res.status(204).send();
};
```

### Step 3: Create the Routes

Create `src/routes/api/v1/product.routes.ts`:

```typescript
import { Router } from "express";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import {
	createProductSchema,
	updateProductSchema,
	productIdParamsSchema,
	listProductsQuerySchema,
} from "../../../models/product.model";
import {
	createProductHandler,
	getProducts,
	getProductById,
	updateProductHandler,
	deleteProduct,
} from "../../../controllers/product.controller";

const router = Router();

router.get(
	"/",
	authenticate,
	validate({ query: listProductsQuerySchema }),
	getProducts
);

router.post(
	"/",
	authenticate,
	doubleCsrfProtection,
	validate({ body: createProductSchema }),
	createProductHandler
);

router.get(
	"/:id",
	authenticate,
	validate({ params: productIdParamsSchema }),
	getProductById
);

router.patch(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate({ params: productIdParamsSchema, body: updateProductSchema }),
	updateProductHandler
);

router.delete(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate({ params: productIdParamsSchema }),
	deleteProduct
);

export default router;
```

### Step 4: Register the Routes

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

### Step 5: Describe the Routes

The API document is built from route descriptions that hold the same zod
schemas the validators run. Create `src/openapi/paths/products.ts`:

```typescript
import { z } from "zod";
import {
	createProductSchema,
	updateProductSchema,
	productIdParamsSchema,
	listProductsQuerySchema,
	productSchema,
} from "../../models/product.model";
import { describeRoutes, named } from "../registry";

const product = named("Product", productSchema);

const productPage = named(
	"ProductPage",
	z.strictObject({
		items: z.array(product),
		total: z.number().int(),
		limit: z.number().int(),
		offset: z.number().int(),
	})
);

describeRoutes([
	{
		method: "get",
		path: "/products",
		operationId: "getProducts",
		summary: "Get a page of products",
		tags: ["Products"],
		access: "session",
		request: { query: listProductsQuerySchema },
		responses: {
			200: { description: "A page of products", schema: productPage },
			401: "Unauthorized",
		},
	},
	{
		method: "post",
		path: "/products",
		operationId: "createProduct",
		summary: "Create a product",
		tags: ["Products"],
		access: "session",
		csrf: true,
		request: { body: createProductSchema },
		responses: {
			201: { description: "Product created", schema: product },
			400: "Validation error",
			401: "Unauthorized",
			403: "Invalid CSRF token",
		},
	},
	// ...GET, PATCH and DELETE /products/:id the same way
]);
```

Then import it in `src/openapi/index.ts`, add `["/products", productRoutes]`
to the `mounts` list in `src/openapi/__tests__/openapi.test.ts`, and run
`npm run openapi` to regenerate `openapi.json`. The openapi tests fail if a
mounted route is not described, if a description names a different schema
object than its validator runs, or if `openapi.json` is stale. In route tests,
`createTestApp` checks every JSON response against the description.

### Step 6: Add Tests

Create `src/models/__tests__/product.model.test.ts`:

```typescript
import { createProduct, createProductSchema } from "../product.model";

describe("Product Model", () => {
	describe("createProduct", () => {
		it("should create a product", () => {
			const product = createProduct({
				name: "Test Product",
				price: 99.99,
			});

			expect(product.id).toBeDefined();
			expect(product.name).toBe("Test Product");
			expect(product.price).toBe(99.99);
		});
	});
});

describe("createProductSchema", () => {
	it("should validate correct input", () => {
		const result = createProductSchema.safeParse({
			name: "Product",
			price: 10,
		});
		expect(result.success).toBe(true);
	});

	it("should reject negative price", () => {
		const result = createProductSchema.safeParse({
			name: "Product",
			price: -5,
		});
		expect(result.success).toBe(false);
	});
});
```

Create `src/routes/api/v1/__tests__/product.routes.test.ts`:

```typescript
import request from "supertest";
import { createTestApp } from "../../../../test/app";

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

		it("should reject invalid price", async () => {
			const response = await request(app)
				.post("/api/v1/products")
				.send({ name: "Test", price: -5 });

			expect(response.status).toBe(400);
		});
	});

	describe("GET /api/v1/products", () => {
		it("should return a page", async () => {
			const response = await request(app).get("/api/v1/products");
			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ limit: 20, offset: 0 });
			expect(Array.isArray(response.body.items)).toBe(true);
		});
	});
});
```

### Step 7: Run Tests

```bash
npm test
```

## Environment Variables

`config/env.ts` validates these with zod at startup. `npm run dev` loads `.env.development`, `npm start` loads `.env.production` - both through Node's native `--env-file-if-exists`, so the file is optional and a real environment variable always wins over it. Keys with a default below can be omitted.

| Variable             | Default                             | Description                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------ |
| `NODE_ENV`           | `development`                       | Environment mode                                 |
| `PORT`               | `3000`                              | Server port                                      |
| `LOG_LEVEL`          | `info`                              | Winston log level                                |
| `SERVICE_NAME`       | `jwt-backend`                       | Service name for logs                            |
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

## API Documentation

Swagger UI is at `http://localhost:3000/docs` and the raw document at `/docs.json`
when the server runs outside production. The same document is committed as
`openapi.json`; regenerate it with `npm run openapi` after changing a route
description or a schema it uses.

## Key Patterns

### Error Handling

Use `createError` from `http-errors` for operational errors:

```typescript
import { createError } from "../middleware/errorHandler";

throw createError(404, "Resource not found");
throw createError(400, "Invalid input");
```

### Validation

Use Zod schemas with the `validate` middleware:

```typescript
import { validate } from "../middleware/validate";

router.post("/", validate({ body: createSchema }), handler);
router.get("/:id", validate({ params: idSchema }), handler);
router.get("/", validate({ query: filterSchema }), handler);
```

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

`POST /auth/refresh` needs the `x-csrf-token` header too, so a cross-site form cannot
rotate the session when `COOKIE_SAME_SITE=none`. Send the token you already hold. The
`access_token` cookie is kept for `JWT_REFRESH_EXPIRY`, not `JWT_ACCESS_EXPIRY`, so it is
still there to check the token against after the JWT inside it has expired.

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
not do - rate limiting, TLS, a real datastore, a shared revocation store - which of those
your platform probably handles for you, and a short list of things that are simply bugs.
Read it before the first deploy, not after.
