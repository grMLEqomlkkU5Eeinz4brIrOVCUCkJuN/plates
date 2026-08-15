# Express TypeScript Backend Template (JWT)

A simple Express.js backend template with TypeScript, JWT authentication, CSRF protection, Zod validation, Winston logging, Swagger docs, and Jest testing. Not specific to any tech stack.

## Quick Start

```bash
# Install dependencies
npm install

# Development (hot reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## Project Structure

```
.
├── Dockerfile
├── eslint.config.mjs
├── jest.config.ts
├── nodemon.json
├── package.json
├── package-lock.json
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

// Derive types from schemas
export type ProductData = z.infer<typeof productSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductData = z.infer<typeof updateProductSchema>;

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
} from "../models/product.model";
import { createError } from "../middleware/errorHandler";

// Replace with your database
const products = new Map<string, ProductData>();

export const createProductHandler = (req: Request, res: Response) => {
	const product = createProduct(req.body as CreateProductData);
	products.set(product.id, product);
	res.status(201).json(product);
};

export const getProducts = (_req: Request, res: Response) => {
	res.json([...products.values()]);
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

### Step 5: Add Tests

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
		it("should return array", async () => {
			const response = await request(app).get("/api/v1/products");
			expect(response.status).toBe(200);
			expect(Array.isArray(response.body)).toBe(true);
		});
	});
});
```

### Step 6: Run Tests

```bash
npm test
```

## Environment Variables

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
| `CSRF_SECRET`        | (required)                          | Secret for CSRF token generation (min 32 chars)  |

## Available Scripts

| Script                  | Description           |
| ----------------------- | --------------------- |
| `npm run dev`           | Start with hot reload |
| `npm run build`         | Compile TypeScript    |
| `npm start`             | Run production build  |
| `npm test`              | Run all tests         |
| `npm run test:watch`    | Watch mode            |
| `npm run test:coverage` | With coverage         |

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
