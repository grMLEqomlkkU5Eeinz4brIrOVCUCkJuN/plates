FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# --production drops devDependencies: vitest, drizzle-kit, the frontend's build chain.
# None of it runs in this image.
RUN bun install --frozen-lockfile --production

# There is no bundling step, on purpose. Bun runs TypeScript directly, so the container
# executes the same src/ the tests execute.
#
# `bun build` would also put a landmine under the first native addon you add - argon2,
# bcrypt, sharp. Such a package picks its .node binary through a runtime platform check,
# and the bundler rewrites those requires to paths relative to the *original* package
# directory in node_modules. The binary is emitted into dist/, nothing can load it from
# there, and the build still exits 0 - a green CI shipping an image that dies on the first
# line. The sibling base-jwt template hit exactly this with argon2.
FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Workspace dependencies hoist to /app/node_modules. Module resolution walks up from
# backend/ and finds them there, so backend/ needs no node_modules of its own.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
# .dockerignore is what keeps node_modules, dist/ and a local .env out of this layer.
COPY backend ./backend

# The backend package root: CMD is relative to it. Nothing else depends on the cwd -
# proto/ is resolved relative to its own source file, not from here.
WORKDIR /app/backend
USER bun
# 3000 is REST + tRPC, 50051 is gRPC.
EXPOSE 3000 50051
CMD ["bun", "run", "src/index.ts"]
