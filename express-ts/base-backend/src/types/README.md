# src/types

Global type declarations only. `express.d.ts` adds `requestId` to Express's
`Request`; augmentations for other libraries go next to it as
`{library}.d.ts`.

Everything else lives with the code that uses it. Model types are inferred
from the Zod schemas in `src/models/*.model.ts` (`z.infer`), and helpers go
in `src/utils/helpers.ts`.
