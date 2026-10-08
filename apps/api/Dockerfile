# Build context: the repo root (`docker compose` sets it).
# The API runs on Node type stripping, which refuses files under node_modules. The shared
# package exports `.ts`, so it must stay a symlinked workspace package: no `pnpm deploy`.
FROM node:24-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# package.json first: its `packageManager` pins the pnpm version corepack runs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# --ignore-scripts: the root `prepare` runs git, which the image does not have.
RUN pnpm install --offline --prod --frozen-lockfile --ignore-scripts \
  --filter @property-manager/api...

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "node src/db/migrate-cli.ts && exec node src/main.ts"]
