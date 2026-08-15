# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

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

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# utils/logger.ts writes rotating files to /app/logs. Create it and hand it to
# the node user before dropping privileges - an unprivileged process cannot
# mkdir inside a root-owned WORKDIR, and winston fails at startup if it tries.
# Drop the file transports and this can go.
RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node

EXPOSE ${PORT}

CMD ["node", "dist/main.js"]
