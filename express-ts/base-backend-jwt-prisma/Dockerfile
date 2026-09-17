# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

# --ignore-scripts because postinstall runs `prisma generate`, and the schema is
# not in the image yet at this point. It is generated explicitly below, once the
# source is here, which also keeps `prepare` (lefthook) from running in a
# directory that is not a git repository.
RUN npm ci --ignore-scripts

COPY . .

# Writes the client to src/generated/prisma, which tsc then compiles into dist
# along with everything else. There is no engine binary to carry in Prisma 7;
# the query compiler ships inside @prisma/client. `generate` never connects,
# and prisma.config.ts tolerates the missing DATABASE_URL for exactly this.
RUN npx prisma generate

RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# NODE_ENV is not decoration here. config/env.ts defaults it to "development"
# when unset, and app.ts switches helmet's CSP and COEP on, and the schema
# browser off, only in production. An image without this line ships with all
# three the wrong way round, and starts perfectly while it does.
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./

# Same reason as above: the prisma CLI is a devDependency, so postinstall cannot
# run here at all. The generated client arrives compiled, inside dist. argon2's
# native binary is a prebuilt for linux-musl and needs no toolchain.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# utils/logger.ts writes rotating files to LOG_DIR, which resolves from the
# working directory. Create it and hand it to the node user before dropping
# privileges: an unprivileged process cannot mkdir inside a root-owned
# WORKDIR, and winston fails at startup if it tries. Drop the file transports
# and this can go.
RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node

EXPOSE ${PORT}

# Points at the readiness probe. An orchestrator restarting this container
# because Postgres is unreachable does not help; taking it out of rotation does.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are not applied here. `prisma migrate deploy` needs the CLI, which
# is a devDependency, and running it at container start means every replica
# racing to migrate the same database. Run `npm run db:deploy` as its own step,
# a job, a release task, a CI stage, before this version starts serving.
CMD ["node", "dist/main.js"]
