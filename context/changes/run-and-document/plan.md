# Plan: run-and-document (S-06)

## Goal and end state

A fresh clone starts with one command, is documented, and the AI deliverables are complete and
linked. When done:

- With Docker installed and a `.env` copied from `.env.example` with only `WEATHERSTACK_KEY`
  filled in, `docker compose up` starts PostgreSQL, the API (migrations first) and the web UI.
  The UI is reachable at `http://localhost:5173`, deep links such as `/properties/new` load the
  SPA, and the UI's `/graphql` calls reach the API (FR-14 AC1, NFR-10).
- A Playwright smoke suite runs against that Compose stack with Weatherstack replaced by a stub
  service. It covers create → details (weather + coordinates) → list (newest first) → city
  filter → delete with confirm → gone, plus the quota-error journey. It runs as `pnpm e2e`
  locally and as its own CI job (TR-24, success criteria 1–3).
- `README.md` contains every item FR-14 AC2 lists, plus a per-roadmap-item index of the
  `ai-sessions/` exports (FR-14 AC2, FR-15 AC2).
- The repository contains CLAUDE.md, `.claude/skills/`, `.mcp.json` (no secrets),
  `docs/ai-workflow.md` and `context/`, and the README links them (FR-15 AC1).
- FR-14 AC3 (fail fast on a missing key) is already proven by `apps/api/src/config/env.test.ts`
  and `main.test.ts` (F-01). In Compose it surfaces as the `api` container exiting with that
  message. No new test is needed.

## Scope

- In: Dockerfiles for `api` and `web`, the `api` and `web` services in `docker-compose.yml`,
  `.dockerignore`, the nginx config, the Weatherstack stub, `docker-compose.e2e.yml`, the
  Playwright config / global setup / specs, the `pnpm e2e` script, the CI e2e job, README, and
  the related doc updates (CLAUDE.md commands, test-plan TR-24 status and stub location,
  roadmap session-naming text and status).
- Out:
  - API or UI behaviour changes.
  - Production hardening (TLS, non-root tuning beyond the base images' defaults, image
    publishing; NG-07).
  - A `/mutation` step: S-06 touches no module in the test-plan *Mutation targets*. The stub is
    test tooling, not a target.
  - FR-16 seed data (Could, #13).
  - Should items in the roadmap's *Later*.

## Findings

**Current state**

- `docker-compose.yml:1-20` has only `postgres` (`postgres:18-alpine`, healthcheck, host port
  5432, volume `postgres-data`).
- No `README.md` exists, there is no `e2e/` directory, and Playwright is not a dependency.
  `.mcp.json` configures Playwright MCP only.
- `apps/api/package.json` `start` is `node src/main.ts` (type stripping). Migrations run with
  `node src/db/migrate-cli.ts`, which needs only `DATABASE_URL` (`config/env.ts`
  `loadDatabaseConfig`). The migrations folder is resolved from the module
  (`db/migrate.ts:6`), so any cwd works.
- `apps/api/src/config/env.ts`: `WEATHERSTACK_BASE_URL` (default
  `https://api.weatherstack.com`), `DATABASE_URL` (default `localhost`), `PORT` (4000),
  `LOG_LEVEL`. An empty value counts as unset, so `WEATHERSTACK_KEY=` fails fast with
  "Missing required environment variable: WEATHERSTACK_KEY".
- The adapter calls `${baseUrl}/current?access_key=…&query=…&units=f`
  (`adapters/weatherstack/client.ts:39-43`), so the stub only needs `GET /current`.
- The web client posts to the relative path `/graphql` (`apps/web/src/lib/execute.ts`, the
  `fetch('/graphql')` call). In dev, Vite proxies it to `localhost:4000` (`apps/web/vite.config.ts`).
  The static server must therefore proxy `/graphql` from the same origin. No CORS is needed.
- The API exposes a `health` query (`smoke.int.test.ts:23`). Yoga 5 also serves `GET /health`
  by default; `/implement` verifies this before using it in the compose healthcheck, and
  falls back to `POST /graphql {health}` otherwise.
- `docs/samples/weatherstack-current.json` is Fountain Hills, region `Arizona`, lat 33.609 /
  lon −111.729. An e2e create with state `AZ` therefore passes the region check (FR-05 AC4).
- The roadmap describes session exports as `NN-<change-id>-<step>.txt`, but the actual files
  are `NN-<step>-<ROADMAP-ID>[-n].txt` (e.g. `27-plan-S-01.txt`). Every item F-01 … S-05 has
  plan, implement, mutation (except S-05, by test-plan decision) and review exports. F-01 has
  no plan-review export: `/plan-review` did not exist yet. The README index and the roadmap
  text follow the real names.
- `tsconfig.json` (root) includes `*.ts` and `tooling/**/*.ts` only. ESLint lints `**/*.ts`
  with the project service, so `e2e/**` must be in a tsconfig or lint fails.
- CI (`.github/workflows/ci.yml`) has a single `check` job. Its `WEATHERSTACK_KEY` is the
  sentinel.

**Library and platform facts**

- Node refuses to strip types in files under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). `@property-manager/shared` exports
  `./src/index.ts`. It works today because pnpm symlinks the workspace package, so its real
  path is outside `node_modules`. `pnpm deploy` would copy it into `node_modules` and break
  the API at start-up. The API image must therefore keep the workspace layout: `pnpm fetch
  --prod`, then `pnpm install --offline --prod --filter @property-manager/api...` (pnpm docs,
  `cli/fetch.md`, context7 `/pnpm/pnpm.io`).
- pnpm publishes `ghcr.io/pnpm/pnpm:12`, which takes a Node runtime via `pnpm runtime set node
  24 -g` (pnpm docs, Docker guide). Plain `node:24-alpine` + `corepack enable` also works,
  because Node 24 still ships corepack. `/implement` picks one, preferring `node:24-alpine`
  (the official Node image, and `packageManager` in `package.json` pins pnpm 12.9.1).
- Compose merges `ports` lists by concatenation. An override file removes a published port
  with `ports: !reset []` and replaces it with `!override` (docs.docker.com, compose-file
  `merge.md`).
- Playwright starts `webServer` plugins before `globalSetup`. `webServer` kills the process
  group with SIGKILL unless `gracefulShutdown` is set, and the docs note that Docker needs
  SIGTERM. Starting Compose from `globalSetup` (`docker compose … up -d --build --wait`) and
  stopping it in `globalTeardown` (`down -v`) avoids both issues (context7
  `/microsoft/playwright`, `test-webserver-js.md`, `test-global-setup-teardown-js.md`).

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How does `web` serve the SPA? | nginx stage: `dist/` with `try_files … /index.html`, `location /graphql` proxied to `api:4000` | Same origin, no CORS, SPA fallback in a few config lines; matches tech-stack "Vite build served statically" | user |
| Where does the stub live and how is the e2e stack started? | `e2e/stub/server.ts` (`node:http`, run under type stripping in `node:24-alpine`), added by `docker-compose.e2e.yml`, which also repoints `WEATHERSTACK_BASE_URL`; separate Compose project name and fresh volume; started and stopped from Playwright `globalSetup` / `globalTeardown` | Dev data and the dev stack are untouched, and the real key never goes to the stub | user |
| How does the README link AI sessions? | A table per roadmap item listing its export files, plus the pre-roadmap ones (00–09) | Proves "covering every roadmap item" at a glance (FR-15 AC2) | user |
| Phase shape | 3 phases: Compose stack → e2e → docs | Each phase is one reviewable diff | user |
| Web port in Compose | `5173` (same as dev) | tech-stack *Local development*; one URL in the README | research |
| Migrations in Compose | `api` command runs `node src/db/migrate-cli.ts && node src/main.ts`; no separate service | tech-stack "api (runs migrations, then starts)"; one service fewer | research |
| How is `WEATHERSTACK_KEY` passed to `api`? | `environment: WEATHERSTACK_KEY: ${WEATHERSTACK_KEY:-}` (Compose reads `.env` for interpolation) | A missing key reaches the API, which fails fast and names the variable (FR-14 AC3). `${VAR:?}` would also abort the e2e/CI stack, which has no real key | research |
| Key in the e2e stack | Overridden to a non-secret placeholder in `docker-compose.e2e.yml` | The developer's real key is never sent anywhere during e2e (NFR-02, CLAUDE.md) | research |
| Session file naming | Document the real `NN-<step>-<ROADMAP-ID>[-n].txt`; fix the roadmap text | Artifacts must match reality; renaming 60+ files would break references in commits and docs | research |
| Mutation step for S-06 | None | No *Mutation targets* module is touched | research (test-plan) |

## Design

**Images**

- `apps/api/Dockerfile` (build context: repo root). Base `node:24-alpine` with corepack
  enabled. Copies `pnpm-lock.yaml` and `pnpm-workspace.yaml`, then runs `pnpm fetch --prod`,
  then copies the root `package.json`, `apps/api` and `packages/shared`, then runs
  `pnpm install --offline --prod --frozen-lockfile --ignore-scripts --filter
  @property-manager/api...`.
  `WORKDIR apps/api`. `CMD` runs migrate, then start. `NODE_ENV=production`.
  Invariant: no `pnpm deploy`; `packages/shared` stays a symlinked workspace package.
  Invariant (both images): installs use `--ignore-scripts`. The root `prepare` script runs
  `git config`, but the image has no `.git` (excluded by `.dockerignore`) and no `git`.
  `allowBuilds` in `pnpm-workspace.yaml` already disables native builds, so nothing is lost.
- `apps/web/Dockerfile` (build context: repo root). The build stage copies the root
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json` (extended by
  `apps/web/tsconfig.app.json`), `apps/web` and `packages/shared`, installs the web and shared
  deps with `--ignore-scripts` (dev deps included, since Vite builds) and runs `pnpm --filter
  @property-manager/web build`. The runtime stage is `nginx:<pinned>-alpine` with
  `apps/web/nginx.conf` and `dist/`.
- `apps/web/nginx.conf`: `listen 80`; `location / { try_files $uri $uri/ /index.html; }`;
  `location /graphql { proxy_pass http://api:4000; }`.
- `.dockerignore`: `node_modules`, `**/node_modules`, `.env*` except `.env.example`, `.git`,
  `reports`, `test-results`, `playwright-report`, `**/.stryker-tmp`, `ai-sessions`.
  Invariant: `.env` never enters a build context.

**Compose (`docker-compose.yml`)**

```
postgres  (unchanged, healthcheck)
api       build apps/api/Dockerfile; depends_on postgres: service_healthy
          env: DATABASE_URL=postgres://postgres:postgres@postgres:5432/property_manager,
               WEATHERSTACK_KEY=${WEATHERSTACK_KEY:-}, WEATHERSTACK_BASE_URL (optional passthrough),
               LOG_LEVEL; ports 4000:4000 (GraphiQL for reviewers);
          healthcheck: wget -qO- http://localhost:4000/health
web       build apps/web/Dockerfile; depends_on api: service_healthy; ports 5173:80;
          healthcheck: wget -qO- http://localhost/
```

Healthchecks use busybox `wget`, which `node:24-alpine` and `nginx:*-alpine` both ship;
neither image has `curl`.

`pnpm dev` keeps using only `postgres` (`docker compose up -d postgres`), so dev is unchanged.

**E2E**

- `e2e/stub/server.ts`: `GET /current` returns `docs/samples/weatherstack-current.json`
  (mounted read-only), with `request.query` echoed. If the `query` parameter contains `QUOTA`
  it returns HTTP 200 with `{ success: false, error: { code: 104, … } }`. Every other path
  returns 404, except `GET /healthz` (200, for the Compose healthcheck). It logs neither `access_key` nor the URL. Trigger list in `e2e/stub/README.md`.
- `docker-compose.e2e.yml`:
  - adds `weather-stub` (`node:24-alpine`, `node /stub/server.ts`, healthcheck
    `wget -qO- http://localhost:<port>/healthz`, a path the stub answers with 200);
  - `api`: `WEATHERSTACK_BASE_URL=http://weather-stub:<port>`, `WEATHERSTACK_KEY=e2e-stub-key`,
    `ports: !reset []`, plus `depends_on` the stub;
  - `postgres`: `ports: !reset []`;
  - `web`: `ports: !override ["5180:80"]`, so it does not clash with a dev Vite on 5173.
  The project name is `property-manager-e2e` (`-p`), so its volume is separate from dev data.
- `e2e/playwright.config.ts`: `testDir: '.'` (Playwright resolves it relative to the config
  file, so `'e2e'` would mean `e2e/e2e`; the default `*.spec.ts` match keeps `e2e/stub/**`
  out), Chromium only (NG-11),
  `baseURL http://localhost:5180`, `globalSetup` / `globalTeardown`, trace on first retry,
  `retries` 1 in CI, 0 locally.
- `e2e/global-setup.ts`: `docker compose -p property-manager-e2e -f docker-compose.yml -f
  docker-compose.e2e.yml up -d --build --wait`. `global-teardown.ts`: `… down -v`, unless
  `E2E_KEEP_STACK=1` is set (for debugging). Both resolve the compose file paths from
  `import.meta.dirname` (repo root = its parent) and spawn with that `cwd`, so the result does
  not depend on where `pnpm e2e` was invoked.
- `e2e/helpers.ts`: `uniqueStreet()` (timestamp + random suffix).
- Specs:
  - `e2e/property-journey.spec.ts` (TR-24 happy path): create `uniqueStreet()`,
    `Fountain Hills`, `AZ`, `85268` → URL `/properties/<id>` showing a temperature with °F,
    the description and lat/long → list → the new row is first with newest-first sort →
    filter city `Fountain Hills` keeps it → delete → confirm dialog → row gone and the
    details URL shows not found.
  - `e2e/create-errors.spec.ts`: street containing `QUOTA` → the form shows the
    `WEATHER_QUOTA_EXCEEDED` message from `apps/web/src/lib/graphql-errors.ts` and keeps the
    values.
- Root `package.json`: `"e2e": "playwright test -c e2e/playwright.config.ts"`, plus the
  `@playwright/test` dev dependency (pinned 1.63.x, per tech-stack).
- CI: an `e2e` job with `needs: check` that installs, runs `pnpm exec playwright install
  --with-deps chromium` and `pnpm e2e`, and uploads `playwright-report` on failure. No secrets.

**Error model**: unchanged. The e2e quota spec exercises the existing `WEATHER_QUOTA_EXCEEDED`
path end to end.

## Phases

### Phase 1: Compose stack (api + web images)
- Files:
  - `apps/api/Dockerfile`: new. Contract: the image runs migrations, then the API on `:4000`
    under type stripping, with prod deps only and the workspace layout kept.
  - `apps/web/Dockerfile`: new. Contract: a multi-stage Vite build, served by nginx on `:80`.
  - `apps/web/nginx.conf`: new. Contract: SPA fallback to `/index.html`; `/graphql` proxied
    to `http://api:4000`.
  - `.dockerignore`: new. Contract: `.env` and `node_modules` are never in the build context.
  - `docker-compose.yml`: add `api` and `web` as in *Design*. Contract: `docker compose up`
    is the single start command; `postgres` alone still works for dev.
  - `.prettierignore` / ESLint ignores: only if the new files trip them.
- Proves: FR-14 AC1 (start command, UI URL, deep link, `/graphql` through the UI origin). This
  phase checks it by command; Phase 2 adds automated proof through e2e. FR-14 AC3 in Compose:
  the `api` container exits with the missing-variable message.
- Agent checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`.
  Precondition for the Compose checks: `pnpm dev` is stopped (it holds ports 4000 and 5173).
  They run on the dev project, so `api` migrates the dev volume; that is expected and harmless.
  `WEATHERSTACK_KEY=placeholder docker compose up -d --build --wait`, then
  `curl -fsS localhost:5173/` and `curl -fsS localhost:5173/properties/new` (both return
  `index.html`), then `curl -fsS -X POST localhost:5173/graphql -H 'content-type:
  application/json' -d '{"query":"{ health }"}'` → `{"data":{"health":"ok"}}`, then
  `docker compose logs api` shows the migration and `listening`; `docker compose down`.
  Also `WEATHERSTACK_KEY= docker compose up api` → it exits non-zero and the log names
  `WEATHERSTACK_KEY`. The key value is never printed: only the placeholder is used.
- Human checks: with your real `.env`, `docker compose up`, open `http://localhost:5173`,
  create one real property (uses one quota call), see it on the details page, reload the
  details URL. Then `docker compose down`.

### Phase 2: E2E smoke against the Compose stack
- Files:
  - `e2e/stub/server.ts`: new. Contract: `GET /current` → sample JSON; `query` containing
    `QUOTA` → error 104 body; `/healthz` → 200; anything else → 404; never logs `access_key`.
  - `e2e/stub/README.md`: new. Contract: the trigger list (test-plan cookbook step 2).
  - `docker-compose.e2e.yml`: new, as in *Design*. Contract: the stub service, the api pointed
    at it with a placeholder key, no host ports except web on 5180.
  - `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`,
    `e2e/helpers.ts`: new. Contract: `pnpm e2e` brings up a fresh stack, runs, and tears it
    down.
  - `e2e/property-journey.spec.ts`, `e2e/create-errors.spec.ts`: new, as in *Design*.
  - `e2e/tsconfig.json` (or root `tsconfig.json` `include`): `e2e/**/*.ts` typechecked and
    linted. The stub follows the type-stripping rules (`.ts` imports, no enums).
  - `package.json`: `e2e` script, `@playwright/test` dev dependency; `pnpm-lock.yaml`.
  - `vitest.config.ts` / Vitest configs: make sure `e2e/**/*.spec.ts` is not collected by
    Vitest.
  - `.github/workflows/ci.yml`: an `e2e` job (`needs: check`), Chromium install, `pnpm e2e`,
    report artifact on failure.
- Proves: TR-24 (E level): FR-14 AC1 on the real stack; success criteria 1–3 (create →
  details → list → filter → delete), and the quota part of success criterion 4 through the UI.
- Agent checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:unit`
  (Vitest still ignores `e2e/`), `pnpm e2e` green twice in a row (fresh volume each time),
  `docker ps` shows no `property-manager-e2e` containers afterwards; CI e2e job green on the
  pushed branch or PR.
- Human checks: open the Playwright HTML report once and confirm the trace shows the
  journey; confirm the dev stack (`docker compose up`) and its data are untouched after
  `pnpm e2e`.

### Phase 3: README and AI deliverables
- Files:
  - `README.md`: new. Contract: the FR-14 AC2 checklist:
    - prerequisites (Docker with Compose; for dev, Node 24 via `.nvmrc` and pnpm via corepack);
    - setup (`cp .env.example .env`, set the key);
    - the start command and URLs (UI `:5173`, GraphiQL `:4000/graphql`);
    - the dev workflow (`docker compose up -d postgres`, `pnpm install`, `pnpm db:migrate`,
      `pnpm dev`, codegen);
    - tests (`pnpm test:unit`, `pnpm test`, `pnpm e2e`, mutation; no real Weatherstack calls);
    - the env variable table (from `.env.example`);
    - the no-auth statement (D-13);
    - the coordinate-precision note (city level, D-05);
    - the Weatherstack quota and HTTPS notes (`WEATHERSTACK_BASE_URL`);
    - "Decisions beyond the brief", stating and justifying FR-08 duplicate blocking, FR-05 AC4
      region vs. state, NG-05 50 states + DC, D-08 imperial units and FR-01 optional
      `limit`/`offset` defaulting to all;
    - an "AI setup" section linking CLAUDE.md, `.claude/skills/`, `.mcp.json`,
      `docs/ai-workflow.md`, `context/` and `context/lessons.md` (FR-15 AC1);
    - an "AI sessions" table: pre-roadmap steps (00–09), then one row per roadmap item with
      links to its export files (FR-15 AC2). The S-06 row lists the exports that exist at
      commit time; the item's last commit adds the rest.
  - `CLAUDE.md`: *Commands* E2E row → `pnpm e2e` (needs Docker), and the one-command start.
  - `context/test-plan.md`: TR-24 → `covered (S-06)`; cookbook "Add an e2e test" step 1 names
    `docker-compose.e2e.yml` and `e2e/stub/`; the stub trigger is `QUOTA` in the street.
  - `context/roadmap.md`: the session-naming text and RQ-03 (both say
    `NN-<change-id>-<step>.txt`) → `NN-<step>-<ROADMAP-ID>[-n].txt`; RQ-03 gets a note that
    the S-06 plan corrected it.
  - `docs/ai-workflow.md`: one line on session exports and where they are indexed (README).
- Proves: FR-14 AC2 and FR-15 AC1/AC2 by checklist (test-plan: documents are not tested
  automatically); the roadmap's S-06 acceptance "PRD success criteria 1–7 walk-through".
- Agent checks: `pnpm format:check`, `pnpm lint`; grep `context/test-plan.md` for TR rows still
  `planned` or `gap` (criterion 7; TR-24 flips in this phase); a script check that every relative link in
  `README.md` resolves to an existing file (run once, not committed); grep that the README
  contains each FR-14 AC2 heading.
- Human checks: read the README top to bottom. Confirm the wording of "Decisions beyond the
  brief". Then walk PRD success criteria 1–7, each against its proof:
  1. Clean clone: `git clone` into a temp dir, `cp .env.example .env`, add the key,
     `docker compose up`, reach the UI.
  2. In that stack, create a property from a Zillow address; the details page shows the key
     weather fields and lat/long (also the e2e journey spec).
  3. The e2e journey spec (create, list, filter, delete) plus, in the UI, sort both ways and
     filter by state and zip; in GraphiQL (`:4000/graphql`), list with `limit`/`offset`, get
     and delete one property.
  4. In the UI, submit an invalid zip and a duplicate address and read the messages; the quota
     error is the e2e `create-errors` spec. Unit/integration tests cover the remaining error
     codes.
  5. `pnpm lint`, `pnpm typecheck`, `pnpm test` all green; tests use the fake adapter or MSW.
  6. The README "AI setup" and "AI sessions" sections lead to every artifact and export.
  7. In `context/test-plan.md`, every TR row is `covered`, and the Must FR ACs it lists are
     the ones the tests assert.

## Risks and unknowns

- Resolved: web serving (nginx), stub placement (override file), session index (table),
  migration timing (api command), key handling in Compose and e2e.
- `pnpm install --offline --prod --filter …` inside the image is untested here. If pnpm 12
  fetch/offline misbehaves with `--filter`, the fallback is a plain `pnpm install --prod
  --frozen-lockfile --filter @property-manager/api...` without the fetch layer cache.
  Non-blocking: it only costs build time.
- The Yoga `GET /health` default is assumed (see *Findings*). The fallback is a GraphQL
  health query in the healthcheck. Non-blocking.
- E2E flakiness from stack start-up: `--wait` relies on the healthchecks, so every service
  needs one. A first-run image build in CI adds minutes. No caching beyond the defaults
  unless the job is slow.
- The real-key human check in Phase 1 uses one Weatherstack call.
- FR-15 AC2 is complete only after S-06's own `/review` export. The item's final
  `Closes #8` commit updates the README index (same pattern as the S-05 export commits).

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Compose stack (api + web images) (f86cc80)
- [x] Phase 2: E2E smoke against the Compose stack (6774617)
- [x] Phase 3: README and AI deliverables (ce03f58)

## Deviations

- Phase 1, healthchecks: plan says `wget http://localhost…`; in alpine `localhost` resolves to
  `::1` first and nginx listens on IPv4 only, so `web` stayed unhealthy. Both healthchecks use
  `127.0.0.1`.
- Phase 1, Compose env: `WEATHERSTACK_BASE_URL` and `LOG_LEVEL` pass through as `${VAR:-}`.
  `config/env.ts` treats empty as unset, so the defaults stay in one place.
- Phase 1, migration check: plan says `docker compose logs api` shows the migration;
  `migrate-cli.ts` is silent on success. Checked instead on a fresh volume (separate project):
  `properties` and `drizzle.__drizzle_migrations` exist after `up --wait`.
- Phase 1, API image: `package.json` is copied before `pnpm fetch`, so corepack runs the
  pinned pnpm 12.9.1 for both fetch and install. The offline filtered install works (no
  fallback needed). Yoga's default `GET /health` answers 200.
- Phase 1, `.dockerignore` also drops `**/dist` and `**/reports` (local build and Stryker
  output).
- Phase 2, `e2e/compose.ts`: new helper, not in the plan's file list. Global setup and teardown
  share the `docker compose -p property-manager-e2e -f … -f …` arguments and the repo-root
  `cwd` from it.
- Phase 2, trace: plan says `on-first-retry`; locally there are no retries, so the human check
  ("the trace shows the journey") would find none. Local runs use `trace: 'on'`, CI keeps
  `on-first-retry`. The report and `test-results` go to the repo root (both gitignored).
- Phase 2, stub sample: mounted as the `docs/samples` directory (`SAMPLE_PATH`), not a single
  file, so the read-only `/stub` mount needs no nested mount point.
- Phase 2, e2e lives in the root `tsconfig.json` `include` (the plan's second option); no
  `e2e/tsconfig.json`. Vitest needed no change: every project's `include` is rooted in its own
  directory.
- Phase 2, quota spec: the expected message is copied from `graphql-errors.ts`, not imported
  (web sources resolve with the bundler, the root project with nodenext).
- Phase 3, test-plan: TR-08, TR-16 and TR-17 still said `planned (S-01)`, although S-01 covers
  them (`packages/shared/src/address.test.ts`, `domain/weather.test.ts`,
  `adapters/weatherstack/client.test.ts`). Flipped to `covered (S-01)` so criterion 7 holds.
- Phase 3, README sessions index: the S-06 exports are not in `ai-sessions/` yet, so the S-06
  row points to the closing commit (as planned). The README also links `.claude/settings.json`
  (editor hook) in *AI setup*.
