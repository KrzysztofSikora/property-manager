# Build context: the repo root (`docker compose` sets it).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# --ignore-scripts: the root `prepare` runs git, which the image does not have.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @property-manager/web...
RUN pnpm --filter @property-manager/web build

FROM nginx:1.30-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
