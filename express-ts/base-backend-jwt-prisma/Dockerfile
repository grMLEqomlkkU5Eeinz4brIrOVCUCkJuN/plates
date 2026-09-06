# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# --ignore-scripts because postinstall runs `prisma generate`, and the schema is
# not in the image yet at this point. It is generated explicitly below, once the
# source is here, which also keeps `prepare` (lefthook) from running in a
# directory that is not a git repository.
RUN npm ci --ignore-scripts

COPY . .

# Writes the client to src/generated/prisma, which tsc then compiles into dist
# along with everything else. There is no engine binary to carry in Prisma 7 -
# the query compiler ships inside @prisma/client.
RUN npx prisma generate

RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# NODE_ENV is not decoration here. config/env.ts defaults it to "development"
# when unset, and app.ts switches helmet's CSP and COEP on only in production -
# so an image without this line ships with those headers turned off, and starts
# perfectly while it does.
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./

# Same reason as above: the prisma CLI is a devDependency, so postinstall cannot
# run here at all. The generated client arrives compiled, inside dist.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# utils/logger.ts writes rotating files to /app/logs. Create it and hand it to
# the node user before dropping privileges - an unprivileged process cannot
# mkdir inside a root-owned WORKDIR, and winston fails at startup if it tries.
# Drop the file transports and this can go.
RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node

EXPOSE ${PORT}

# Migrations are not applied here. `prisma migrate deploy` needs the CLI, which
# is a devDependency, and running it at container start means every replica
# racing to migrate the same database. Run `npm run db:deploy` as its own step -
# a job, a release task, a CI stage - before this version starts serving.
CMD ["node", "dist/main.js"]
