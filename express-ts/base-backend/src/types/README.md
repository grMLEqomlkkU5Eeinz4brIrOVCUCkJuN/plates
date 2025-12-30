# Types Folder Guidelines

## Current Project Structure

```
src/
├── config/          # Environment and app configuration
│   └── env.ts
├── controllers/     # Route handlers (business logic)
│   ├── health.controller.ts
│   └── user.controller.ts
├── middleware/      # Express middleware
│   ├── errorHandler.ts
│   ├── httpLogger.ts
│   └── validate.ts
├── models/          # Data models (Zod schemas + classes)
│   ├── user.model.ts
│   └── user.model.test.ts      # Co-located unit test
├── routes/          # Route definitions
│   ├── index.ts
│   ├── health.routes.ts
│   ├── health.routes.test.ts   # Co-located integration test
│   ├── user.routes.ts
│   └── user.routes.test.ts     # Co-located integration test
├── test/            # Test utilities
│   ├── setup.ts                # Global test setup
│   └── app.ts                  # Test app factory
├── types/           # Global type definitions
│   └── express.d.ts
└── utils/           # Utility functions
    ├── asyncHandler.ts
    └── logger.ts
```

## What Goes in `src/types/`

### 1. Declaration Files (`.d.ts`) - Augmenting Libraries

Use for extending third-party library types:

```typescript
// express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
      requestId?: string;
    }
  }
}
export {};
```

### 2. Shared Types (`.ts`) - Cross-Cutting Concerns

Use for types shared across 3+ files:

```typescript
// common.ts
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## What Does NOT Go Here

| Don't put here... | Put it in... |
|-------------------|--------------|
| Model types | `models/*.model.ts` (with Zod schemas) |
| Controller-specific types | The controller file itself |
| Request/Response DTOs | The model or route file |
| Service types | `services/*.service.ts` |

## Type Location Decision Tree

```
Is it augmenting an external library?
  └─ Yes → src/types/*.d.ts

Is it used in 3+ files across different folders?
  └─ Yes → src/types/*.ts

Is it a data model with validation?
  └─ Yes → src/models/*.model.ts (Zod schema + class)

Otherwise → Keep it in the file where it's used
```

## Naming Conventions

| Type | File Pattern | Example |
|------|--------------|---------|
| Library augmentation | `{library}.d.ts` | `express.d.ts` |
| Model types + validation | `{entity}.model.ts` | `user.model.ts` |
| Shared types | `{domain}.ts` | `common.ts`, `api.ts` |

## This Project's Approach

We use **Zod schemas as the source of truth** for types:

```typescript
// models/user.model.ts
import { z } from "zod";

// Schema defines shape AND validation
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});

// Type is derived from schema
export type UserData = z.infer<typeof userSchema>;

// Class provides behavior
export class User {
  constructor(private data: UserData) {}
}
```

This approach:
- Single source of truth (no type/validation drift)
- Runtime validation included
- Types auto-generated from schemas
