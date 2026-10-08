# Express TypeScript Backend Template

This is a simple Express.js backend template with TypeScript, Zod validation, Winston logging, OpenAPI docs generated from the zod schemas, and Jest testing. It is not specific to any tech stack.

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
├── docs
│   └── openapi-inventory.md
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
│   │   ├── health.controller.ts
│   │   └── user.controller.ts
│   ├── main.ts
│   ├── middleware
│   │   ├── errorHandler.ts
│   │   ├── httpLogger.ts
│   │   └── validate.ts
│   ├── models
│   │   ├── __tests__
│   │   │   └── user.model.test.ts
│   │   └── user.model.ts
│   ├── openapi
│   │   ├── __tests__
│   │   │   └── openapi.test.ts
│   │   ├── document.ts
│   │   ├── index.ts
│   │   ├── paths
│   │   │   ├── health.ts
│   │   │   └── users.ts
│   │   ├── registry.ts
│   │   └── responseCheck.ts
│   ├── routes
│   │   ├── api
│   │   │   └── v1
│   │   │       ├── health.routes.ts
│   │   │       ├── index.ts
│   │   │       ├── __tests__
│   │   │       │   ├── health.routes.test.ts
│   │   │       │   └── user.routes.test.ts
│   │   │       └── user.routes.ts
│   │   └── index.ts
│   ├── scripts
│   │   └── openapi.ts
│   ├── test
│   │   ├── app.ts
│   │   └── setup.ts
│   ├── types
│   │   ├── express.d.ts
│   │   └── README.md
│   └── utils
│       ├── asyncHandler.ts
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
	id: z.string().uuid("Invalid product ID"),
});

// Derive types from schemas
export type ProductData = z.infer<typeof productSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductData = z.infer<typeof updateProductSchema>;

// Model class
export class Product {
	readonly id: string;
	name: string;
	price: number;
	readonly createdAt: Date;
	updatedAt: Date;

	constructor(data: ProductData) {
		this.id = data.id;
		this.name = data.name;
		this.price = data.price;
		this.createdAt = data.createdAt;
		this.updatedAt = data.updatedAt;
	}

	static create(data: CreateProductData): Product {
		const now = new Date();
		return new Product({
			id: crypto.randomUUID(),
			...data,
			createdAt: now,
			updatedAt: now,
		});
	}

	update(data: UpdateProductData): void {
		if (data.name !== undefined) this.name = data.name;
		if (data.price !== undefined) this.price = data.price;
		this.updatedAt = new Date();
	}

	toJSON(): ProductData {
		return {
			id: this.id,
			name: this.name,
			price: this.price,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
```

### Step 2: Create the Controller

Create `src/controllers/product.controller.ts`:

```typescript
import { Request, Response } from "express";
import {
	Product,
	CreateProductData,
	UpdateProductData,
} from "../models/product.model";
import { createError } from "../middleware/errorHandler";

// Replace with your database
const products = new Map<string, Product>();

export const createProduct = (req: Request, res: Response): void => {
	const data = req.body as CreateProductData;
	const product = Product.create(data);
	products.set(product.id, product);
	res.status(201).json(product.toJSON());
};

export const getProducts = (_req: Request, res: Response): void => {
	const all = Array.from(products.values()).map((p) => p.toJSON());
	res.json(all);
};

export const getProductById = (req: Request, res: Response): void => {
	const product = products.get(req.params.id);
	if (!product) {
		throw createError(404, "Product not found");
	}
	res.json(product.toJSON());
};

export const updateProduct = (req: Request, res: Response): void => {
	const product = products.get(req.params.id);
	if (!product) {
		throw createError(404, "Product not found");
	}
	product.update(req.body as UpdateProductData);
	res.json(product.toJSON());
};

export const deleteProduct = (req: Request, res: Response): void => {
	if (!products.delete(req.params.id)) {
		throw createError(404, "Product not found");
	}
	res.status(204).send();
};
```

### Step 3: Create the Routes

Create `src/routes/api/v1/product.routes.ts`:

```typescript
import { Router } from "express";
import { validate } from "../../../middleware/validate";
import {
	createProductSchema,
	updateProductSchema,
	productIdParamsSchema,
} from "../../../models/product.model";
import asyncHandler from "../../../utils/asyncHandler";
import {
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
} from "../../../controllers/product.controller";

const router = Router();

router.get("/", asyncHandler(getProducts));

router.post(
	"/",
	validate({ body: createProductSchema }),
	asyncHandler(createProduct)
);

router.get("/:id", validate({ params: productIdParamsSchema }), asyncHandler(getProductById));

router.patch(
	"/:id",
	validate({ params: productIdParamsSchema, body: updateProductSchema }),
	asyncHandler(updateProduct)
);

router.delete("/:id", validate({ params: productIdParamsSchema }), asyncHandler(deleteProduct));

export default router;
```

### Step 4: Register the Routes

Update `src/routes/api/v1/index.ts`:

```typescript
import { Router } from "express";
import healthRoutes from "./health.routes";
import userRoutes from "./user.routes";
import productRoutes from "./product.routes"; // Add this

const router = Router();

router.use("/health", healthRoutes);
router.use("/users", userRoutes);
router.use("/products", productRoutes); // Add this

export default router;
```

### Step 5: Describe the Routes

Every route is described once in `src/openapi/paths/`, with the same zod
objects its validator runs. The tests fail if a mounted route has no
description, if a description holds a different schema object than the
validator, or if a response body does not match it.

Create `src/openapi/paths/products.ts`:

```typescript
import { z } from "zod";
import {
	createProductSchema,
	updateProductSchema,
	productIdParamsSchema,
	productSchema,
} from "../../models/product.model";
import { describeRoutes, named } from "../registry";

const product = named("Product", productSchema);

describeRoutes([
	{
		method: "get",
		path: "/products",
		operationId: "getProducts",
		summary: "Get all products",
		tags: ["Products"],
		access: "open",
		responses: {
			200: { description: "List of products", schema: z.array(product) },
		},
	},
	{
		method: "post",
		path: "/products",
		operationId: "createProduct",
		summary: "Create a product",
		tags: ["Products"],
		access: "open",
		request: { body: createProductSchema },
		responses: {
			201: { description: "Product created", schema: product },
			400: "Validation error",
		},
	},
	// ...one entry per route, error statuses as a string
]);
```

Import it in `src/openapi/index.ts`, add the router to `mounts` in
`src/openapi/__tests__/openapi.test.ts`, then regenerate the committed
`openapi.json`:

```bash
npm run openapi
```

### Step 6: Add Tests

Create `src/models/__tests__/product.model.test.ts`:

```typescript
import { Product, createProductSchema } from "../product.model";

describe("Product Model", () => {
	describe("Product.create", () => {
		it("should create a product", () => {
			const product = Product.create({
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

### Step 7: Run Tests

```bash
npm test
```

## Environment Variables

`config/env.ts` validates these with zod at startup. `npm run dev` loads `.env.development`, `npm start` loads `.env.production` - both through Node's native `--env-file-if-exists`, so the file is optional and a real environment variable always wins over it. Keys with a default below can be omitted.

| Variable           | Default                             | Description                       |
| ------------------ | ----------------------------------- | --------------------------------- |
| `NODE_ENV`         | `development`                       | Environment mode                  |
| `PORT`             | `3000`                              | Server port                       |
| `LOG_LEVEL`        | `info`                              | Winston log level                 |
| `SERVICE_NAME`     | `base-backend`                      | Service name for logs             |
| `CORS_ORIGIN`      | `*`                                 | Allowed origins (comma-separated) |
| `CORS_METHODS`     | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Allowed methods                   |
| `CORS_CREDENTIALS` | `false`                             | Allow credentials                 |

## Available Scripts

| Script                  | Description           |
| ----------------------- | --------------------- |
| `npm run dev`           | Watch mode (node --watch); loads `.env.development` |
| `npm run build`         | Compile TypeScript    |
| `npm start`             | Run the build; loads `.env.production` |
| `npm test`              | Run all tests         |
| `npm run test:watch`    | Watch mode            |
| `npm run test:coverage` | With coverage         |
| `npm run openapi`       | Write `openapi.json` from the route descriptions |

## API Documentation

Outside production, Swagger UI is at `http://localhost:3000/docs` and the
OpenAPI 3.0.3 document at `/docs.json`. Both are built from the route
descriptions in `src/openapi/paths/`; `openapi.json` is the committed copy.

## Key Patterns

### Error Handling

Throw an [http-errors](https://github.com/jshttp/http-errors) error, re-exported
from `middleware/errorHandler` as `createError`. `errorHandler` answers with its
status and `{ success: false, message }`. A 4xx message reaches the client; a
5xx or any other thrown error becomes "Internal server error", and the full
error is logged either way.

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

### Async Handlers

Wrap async controllers with `asyncHandler`:

```typescript
import asyncHandler from "../utils/asyncHandler";

router.get(
	"/",
	asyncHandler(async (req, res) => {
		const data = await someAsyncOperation();
		res.json(data);
	})
);
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
