## Backend multi-stage Dockerfile for staging/prod

FROM node:20-alpine AS builder
WORKDIR /app

# install production dependencies in builder
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# copy sources and generate Prisma client
COPY prisma ./prisma
COPY prisma.schema* ./
# copy application sources only (avoid copying host `node_modules`)
COPY src ./src
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npx prisma generate || true

# ensure only production deps remain
RUN npm prune --production || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# copy only the necessary artifacts
COPY --from=builder /app /app

EXPOSE 4000

# readiness / liveness probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:4000/ready || exit 1

USER node

CMD ["node", "src/server.js"]
