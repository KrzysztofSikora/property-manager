# Tech stack

Sources: `context/prd.md` (C-, FR-, NFR-, OQ- IDs refer to it). Versions verified 2026-10-07
against the npm registry, nodejs.org and Docker Hub; setup patterns checked with context7
(GraphQL Yoga, Drizzle ORM, Node.js v24 docs, GraphQL Code Generator). Compatibility of the
less common choices (Node type stripping through a workspace symlink, the TS 6.0 tsconfig flags,
Yoga on graphql 17) was tested in a `node:24-alpine` container.

## Summary

| Area | Choice | Version | Why (one line) |
|------|--------|---------|----------------|
| Runtime | Node.js LTS | 24.x (24.21) | Active LTS; required by Vitest 5, MSW 3, React Router 8 |
| Running API TypeScript | Node built-in type stripping | Node 24 | No tsx, no build step; tested through a pnpm workspace symlink |
| Package manager / layout | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared` | pnpm 12.9 | One rule set (zod schema, states, error codes) shared by API and UI |
| GraphQL server | GraphQL Yoga on `node:http` | 5.24 | Error masking by default (FR-10 AC2), `extensions.code`, few deps |
| GraphQL runtime | `graphql` (graphql-js) | 17.0 | Supported by the whole Yoga + codegen chain; tested |
| Schema approach | SDL-first `schema.graphql` + GraphQL Code Generator | cli 7.4, client-preset 6.2, typescript-resolvers 6.1 | One readable contract, typed from resolver to component |
| Database | PostgreSQL (Docker Compose) | 18 | Unique index for concurrent duplicates (FR-08 AC2), `jsonb` snapshot |
| Data access | Drizzle ORM + `pg`, drizzle-kit migrations | 0.45 / kit 0.31 / pg 8.23 | TS-native schema, no generate step, SQL-like queries |
| Validation | zod | 4.x | Required by CLAUDE.md; args, env, Weatherstack response |
| Outbound HTTP | native `fetch` + `AbortSignal.timeout` | built in | 5 s timeout, one attempt (A-08) without a dependency |
| Config | `node --env-file` + zod | built in | Fail fast naming the missing variable (FR-14 AC3) |
| Logging | pino (JSON), request id per operation | 10.x | Structured logs we can assert the key is absent from (NFR-01) |
| Frontend | React + Vite SPA | React 19.3, Vite 8.3 | Brief mandates React; no SSR needed |
| Routing | React Router, declarative mode | 8.x | Three routes; `useSearchParams` for filters in the URL (FR-11 AC3) |
| Data fetching | TanStack Query + codegen `TypedDocumentString` + small `fetch` wrapper | 5.104 | Typed operations, explicit invalidation after create/delete |
| Forms | React state + shared zod schema | — | Four fields; no form library needed |
| Styling | Tailwind CSS via `@tailwindcss/vite` | 4.3 | Fast states/table/form with native `<dialog>` |
| Unit / integration tests | Vitest + Testing Library | 5.0 / 16.3 | One runner for both apps, native ESM/TS |
| HTTP mocks | MSW | 3.0 | Weatherstack at HTTP level in adapter tests; GraphQL in UI tests |
| DB in tests | Testcontainers (PostgreSQL) | 12.2 | Real migrations and unique index; `pnpm test` needs only Docker |
| E2E | Playwright | 1.63 | Already configured as MCP; API pointed at a stub Weatherstack |
| Mutation testing | StrykerJS (command runner) | 10.0 | vitest-runner 10.0 is broken on Vitest 5 (stryker-js#6210); targets from `context/test-plan.md` |
| TypeScript | `typescript` | 6.0.3 | One version for `tsc`, typescript-eslint and the editor |
| Lint / format | ESLint flat config + typescript-eslint `strictTypeChecked` + Prettier | 10.12 / 8.71 / 3.9 | Type-aware rules enforce NFR-04 and NFR-06 |
| Local run | Docker Compose: postgres + api + web | Compose v5 | One command (FR-14) |

## Decisions

### Runtime and package manager
- Options considered: Node 24 LTS, Node 22 LTS, Node 26 (current, not LTS until late October
  2026); pnpm workspaces vs npm workspaces; one package vs a monorepo.
- Chosen: Node 24 (`.nvmrc` = `24`, `engines.node >=24`) and pnpm 12 workspaces with
  `apps/api`, `apps/web`, `packages/shared`. Node 24 is the Active LTS and the floor for
  Vitest 5 (`^22.12 || ^24`), MSW 3 (`>=22.12`) and React Router 8 (`>=22.22`). The shared
  package holds the address zod schema, the 50 states + DC table and the error-code list, so
  FR-07 and FR-13 AC1 apply the same rules.
- Strongest case against: npm workspaces need no extra tool, and a monorepo adds a package
  boundary for a small app.
- Why we still accept it: pnpm's strict `node_modules` catches undeclared imports, installs
  are faster, and without a shared package the state list and zip rule would be duplicated in
  the UI. pnpm 12 reads overrides and settings only from `pnpm-workspace.yaml`, not the
  `"pnpm"` field in `package.json`.
- Revisit if: Node 26 becomes LTS and a dependency needs it.

### Running TypeScript on the API
- Options considered: Node built-in type stripping, tsx, `tsc` build to `dist/`.
- Chosen: Node type stripping (`node --watch --env-file=.env src/main.ts` in dev, `node
  src/main.ts` in the container). There is no transpiler dependency and no build step. Tested:
  a workspace package symlinked into `node_modules` loads, because Node resolves the symlink
  to its real path outside `node_modules`.
- Strongest case against: tsx is the better-known choice and accepts all TS syntax
  (enums, parameter properties, decorators), with no rules to follow.
- Why we still accept it: the rules are enforced by tooling, not by memory (tested):
  - `erasableSyntaxOnly`: `tsc` rejects enums and parameter properties.
  - `verbatimModuleSyntax`: `tsc` rejects type imports that lack `import type`.
  - `module: nodenext`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`:
    local imports use `.ts`. `tsc` accepts `./x.js` but Node fails on it at runtime, so ESLint
    `no-restricted-imports` with the pattern `^\.{1,2}/.*\.js$` forbids it.
  - Codegen runs with `enumsAsTypes: true` and `useTypeImports: true`, so generated files
    are erasable too.
- Revisit if: a needed library forces non-erasable syntax into our own source.

### API layer
- Options considered: GraphQL Yoga 5, Apollo Server 5, Mercurius (Fastify).
- Chosen: GraphQL Yoga on `node:http`. It masks unexpected errors by default (FR-10 AC2) and
  passes through `GraphQLError` with `extensions.code` (FR-10), checked in the Yoga
  error-masking docs and in a test run. It needs no web framework.
- Strongest case against: Apollo Server is the most familiar to reviewers and ships the
  `BAD_USER_INPUT` / `INTERNAL_SERVER_ERROR` conventions.
- Why we still accept it: we define our own error codes anyway, Apollo Server 5 supports only
  graphql 16, and it needs an Express or standalone integration on top. Yoga does the same job
  with fewer parts.
- Revisit if: we need Apollo-specific features (federation, Apollo Studio).

### GraphQL runtime version
- Options considered: graphql 16.14, graphql 17.0.
- Chosen: graphql 17.0.2. Every package in the chain allows `^17` in its peer range: Yoga,
  `@graphql-tools/*`, codegen plugins, `graphql-sock`, MSW (`>=16`). A Yoga server on 17
  returned a coded `GraphQLError` correctly.
- Strongest case against: 17.0 is four months old (2026-06-15), and 16 is what most examples
  and tools are tested with.
- Why we still accept it: we use only core features (queries, mutations, errors with
  extensions), every dependency declares support, and it saves a major upgrade later.
- Revisit if: a dependency we add needs `^16` only (as Apollo Server does), or a 17 bug hits us.

### Schema approach and code generation
- Options considered: SDL-first + GraphQL Code Generator, code-first Pothos 4, code-first
  Nexus/TypeGraphQL.
- Chosen: SDL-first `apps/api/schema.graphql`. Codegen generates resolver types
  (`typescript` + `typescript-resolvers`, with mappers to our domain types) and web types
  (`client-preset`, `documentMode: 'string'`). The schema file is the contract a reviewer reads.
- Strongest case against: Pothos keeps schema and resolvers in one place, with no server
  codegen step and no risk of the SDL drifting from the resolvers.
- Why we still accept it: codegen output is checked by `tsc`, so drift fails the type check.
  The web needs codegen either way, and SDL is easier to review.
- Revisit if: the schema grows enough that SDL and resolver files get hard to keep in step.

### Persistence
- Options considered: PostgreSQL 18, SQLite, MongoDB.
- Chosen: PostgreSQL 18 (`postgres:18-alpine`) in Docker Compose. Storage enforces FR-08 AC2
  through a unique index on the normalized-address expression, the weather snapshot is stored
  as `jsonb`, and `createdAt` is `timestamptz`.
- Strongest case against: SQLite needs no container, so the whole app could be one process.
- Why we still accept it: Docker is already a prerequisite (Testcontainers, one-command start).
  Postgres handles concurrent writes and the case-insensitive unique index without
  workarounds, and FR-14 expects a database service to start.
- Revisit if: the one-command start must work without Docker.

### Data access
- Options considered: Drizzle ORM 0.45, Prisma 7, Kysely 0.29.
- Chosen: Drizzle ORM with `drizzle-orm/node-postgres` (`pg`), drizzle-kit for SQL migrations.
  The schema is TypeScript, row types are inferred, `jsonb().$type<WeatherData>()` types the
  snapshot, and `uniqueIndex().on(sql\`lower(...)\`)` covers D-07 (Drizzle docs). Stable 0.45;
  1.0 is still beta.
- Strongest case against: Prisma has the most mature migration workflow, and Prisma 7 no longer
  needs the Rust engine.
- Why we still accept it: Prisma adds a schema language and a `generate` step. Kysely has no
  schema or migration generator. Drizzle is closest to SQL with the fewest parts, and drizzle-kit
  loads the TS schema itself.
- Revisit if: Drizzle 1.0 goes stable with breaking changes worth adopting.

### Validation
- Options considered: zod 4 (mandated), valibot.
- Chosen: zod 4. Used at the GraphQL argument boundary, for env config, and for the
  Weatherstack response (NFR-05, R-04). The address schema lives in `packages/shared`.
- Strongest case against: valibot has a smaller bundle for the web.
- Why we still accept it: CLAUDE.md requires zod, and the bundle size does not matter for a
  local app.
- Revisit if: never for this project.

### Outbound HTTP and config
- Options considered: native `fetch` (undici), axios, ky; `--env-file` vs dotenv.
- Chosen: `fetch` with `AbortSignal.timeout(5000)` and no retry (A-08, NFR-03), wrapped in a
  `WeatherClient` adapter that redacts `access_key` in any logged URL or error (NFR-01). Env is
  loaded with `node --env-file` and parsed with zod at start-up.
- Strongest case against: axios has interceptors and familiar error objects.
- Why we still accept it: we make one GET call. The platform covers timeout and abort, and MSW
  intercepts `fetch` natively.
- Revisit if: we add more third-party APIs with shared retry or auth needs.

### Logging (resolves OQ-05)
- Options considered: pino, Yoga's default console logger, winston.
- Chosen: pino JSON logs. A request id (`crypto.randomUUID()`) per GraphQL operation sits in
  the Yoga context and is logged with every line. We do not log the Weatherstack key or full
  request URLs without redaction. Tests capture log output to assert NFR-01.
- Strongest case against: Yoga's built-in logger means no dependency.
- Why we still accept it: structured output can be asserted in tests and read in Docker logs,
  and pino is the standard Node choice.
- Revisit if: we need tracing (then OpenTelemetry).

### Frontend framework, routing and data fetching
- Options considered: Vite SPA vs Next.js; React Router 8 vs TanStack Router; TanStack Query vs
  urql vs Apollo Client 4.
- Chosen: React 19 + Vite 8 SPA. React Router 8 in declarative mode for `/`, `/properties/new`
  and `/properties/:id`, with filters, sort and page in `useSearchParams`. TanStack Query
  runs codegen `TypedDocumentString` operations through a small typed `execute()` over
  `fetch` (the pattern in the GraphQL Code Generator React Query guide). The UI calls
  `invalidateQueries(['properties'])` after create or delete. GraphQL errors are mapped to
  per-code UI messages (NFR-09). Forms use React state and the shared zod schema.
- Strongest case against: Apollo Client or urql are GraphQL-native, with a normalized cache.
  TanStack Router has fully typed search params.
- Why we still accept it: `deleteProperty` returns only an `ID`, so a normalized cache would
  need manual eviction anyway. Explicit invalidation is simpler to read. Three routes don't
  justify TanStack Router's setup, and we validate search params with zod.
- Revisit if: the UI grows to many entities that share cached data.

### Styling
- Options considered: Tailwind CSS 4, CSS Modules, a component library (Mantine).
- Chosen: Tailwind 4 through `@tailwindcss/vite`, with the native `<dialog>` for delete
  confirmation (FR-11 AC5).
- Strongest case against: CSS Modules are built into Vite, so there is no dependency at all.
- Why we still accept it: one plugin, and it is much faster to build the loading, empty and
  error states and the table and form. Utility classes are readable in review.
- Revisit if: the UI needs complex widgets (date pickers, comboboxes).

### Testing
- Options considered: Vitest 5 vs Jest; MSW 3 vs nock; Testcontainers vs a shared Compose test
  DB vs PGlite; Playwright vs Cypress.
- Chosen:
  - Vitest in both apps (Node environment for the API, jsdom + Testing Library for the web).
  - Fake `WeatherClient` injected in service and resolver tests. MSW mocks Weatherstack at the
    HTTP level for the adapter's error, timeout and 429 cases. MSW GraphQL handlers in UI tests.
  - `@testcontainers/postgresql` for repository and API integration tests.
  - Playwright e2e against the Compose stack, with `WEATHERSTACK_BASE_URL` pointed at a stub
    server, so there are no real calls (NFR-02).
  - StrykerJS 10 with the `command` runner running each package's hermetic Vitest config,
    scoped to the targets in `context/test-plan.md`. `@stryker-mutator/vitest-runner` 10.0
    runs zero tests per runtime mutant on Vitest 5 (stryker-js#6210); return to it once fixed.
- Strongest case against: PGlite needs no Docker and starts faster. Jest is more widely known.
- Why we still accept it: Testcontainers runs the real driver, migrations and unique-index
  behaviour that FR-08 AC2 depends on, and Docker is required anyway. Jest's ESM and TS
  handling still needs extra config that Vitest doesn't.
- Revisit if: Testcontainers start-up makes the suite too slow (then share one container per
  run).

### TypeScript and lint tooling
- Options considered: TS 7 for `tsc` + TS 6 for lint side by side (`"ts7":
  "npm:typescript@7.0.2"` plus `"typescript": "npm:@typescript/typescript6"`); TS 6.0 only.
  ESLint + typescript-eslint vs Biome 2.
- Chosen:
  - TS 6.0 only: one `"typescript": "~6.0.3"` used by `tsc`, typescript-eslint and the editor.
    No alias. npm `latest` for `typescript` is 7.0.2, so the `~6.0.3` range is pinned
    explicitly. typescript-eslint 8.71.1 (latest) and 8.71.2-alpha.0 (canary) both declare peer
    `typescript >=4.8.4 <6.1.0` (npm, 2026-10-07), so TS 7 is not supported yet.
  - ESLint 10 flat config with `strictTypeChecked`, `no-explicit-any`, the `.js`-import rule
    above, and layer boundaries through built-in `no-restricted-imports` (resolvers may not
    import repositories or adapters; services may not import resolvers). Prettier formats.
  - tsconfig: `strict`, `skipLibCheck: true` (Yoga's `lru-cache` ships type definitions that
    fail `tsc`), `types: ["node"]`, plus the type-stripping flags above.
- tsconfig options on TS 6.0 (TypeScript 6.0 release notes and tsconfig reference via context7;
  checked with `tsc` 6.0.3 in `node:24-alpine`, 2026-10-07):
  - `erasableSyntaxOnly`, `verbatimModuleSyntax`, `module`/`moduleResolution: nodenext`,
    `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `strict`, `skipLibCheck`:
    all available, none on the 6.0 deprecation list, and `tsc` printed no deprecation warning.
    The deprecated options (`moduleResolution node`/`node10`/`classic`, `baseUrl`, `target:
    es5`, `outFile`, `esModuleInterop false`, and others) are ones we don't use, so 7.0, which
    removes them, needs no tsconfig change.
  - `allowImportingTsExtensions` needs `noEmit`, `emitDeclarationOnly` or
    `rewriteRelativeImportExtensions`; we set `noEmit` and `rewriteRelativeImportExtensions`.
  - 6.0 default changes that affect us: `types` now defaults to `[]`, so we set
    `types: ["node"]` (plus test globals where needed); `strict` now defaults to `true` (we set
    it explicitly anyway); `rootDir` defaults to the tsconfig directory (irrelevant with
    `noEmit`).
  - Tested: enums and parameter properties fail with TS1294, a value import of a type fails
    with TS1484, `.ts` imports type-check, and without `skipLibCheck` `lru-cache`'s
    `index.d.ts` still fails.
- Strongest case against: TS 7 is the current major, and its native `tsc` is much faster.
- Why we still accept it: one compiler is the standard setup a reviewer and an editor expect.
  `tsc` and lint can't disagree, and there is no alias to explain. At this project's size the
  TS 7 speed-up isn't noticeable. TS 6.0 is the bridge release built for parity with 7, so the
  move later is one version bump. Biome would avoid the typescript-eslint limit but has weaker
  type-aware rules for NFR-04.
- Revisit if: typescript-eslint supports TS 7. Then bump the one `typescript` package.

### Local run and containers
- Options considered: Docker Compose for everything; Compose for the DB plus local Node.
- Chosen: both, for different jobs.
  - `docker compose up` runs postgres, api (runs migrations, then starts) and web (Vite build
    served statically). This is the single command for FR-14 / NFR-10.
  - Development uses `docker compose up -d postgres` plus `pnpm dev` (API watch + Vite dev
    server).
- Strongest case against: a single `pnpm dev` with an embedded DB is simpler for the operator.
- Why we still accept it: the brief's assessor runs it once, and Compose needs only Docker and
  `.env`.
- Revisit if: the operator cannot use Docker.

## Architecture sketch

```
apps/web  (React SPA)
  routes/pages → hooks (TanStack Query) → execute() → POST /graphql
                                   │ types from codegen client-preset
                                   ▼
apps/api
  graphql/  schema.graphql + resolvers   map args/results, zod-parse args, map errors → codes
     │
     ▼
  services/ PropertyService               normalize → duplicate check → weather → region check → save
     │                         │
     ▼                         ▼
  repositories/              adapters/
  PropertyRepository         WeatherClient (fetch, 5 s timeout, zod-parsed response, key redaction)
  (Drizzle + pg)                    │
     │                              ▼
     ▼                        Weatherstack /current   (only from createProperty)
  PostgreSQL 18

  config/   zod-parsed env (fail fast)        composition root wires real or fake adapters

packages/shared   address zod schema, US states + DC, error codes  (used by api and web)
```

Dependencies point downward only. Resolvers never touch repositories or adapters, and services
depend on repository/adapter interfaces so tests can inject fakes (NFR-06, NFR-07). ESLint
`no-restricted-imports` enforces the direction.

## Local development

- Prerequisites: Node 24 (`nvm use` reads `.nvmrc`), pnpm via corepack, Docker with Compose.
- `cp .env.example .env` and set `WEATHERSTACK_KEY`.
- `docker compose up`: starts PostgreSQL 18, the API (applies migrations, then serves
  GraphQL on `:4000/graphql`) and the web UI (static build on `:5173`). Ports are confirmed in
  F-01.
- `docker compose up -d postgres && pnpm dev`: the API runs with `node --watch` and type
  stripping, and the web runs on the Vite dev server with HMR. `pnpm codegen --watch`
  regenerates types.
- `pnpm test` (Vitest; needs Docker for Testcontainers), `pnpm lint`, `pnpm typecheck`,
  `pnpm e2e` (Playwright), `pnpm mutation` (Stryker on test-plan targets). Exact
  commands are fixed in F-01 and recorded in CLAUDE.md.
