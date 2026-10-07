# Plan: repo-skeleton (F-01)

## Goal and end state

A pnpm workspace (`apps/api`, `apps/web`, `packages/shared`) where `pnpm lint`,
`pnpm typecheck`, `pnpm test:unit`, `pnpm test`, `pnpm codegen` and `pnpm dev` work on an empty
app. The type-stripping and layering rules are enforced by tooling, and an automated test proves
that a violation fails. When F-01 is done:

- FR-14 AC3: the API, started without `WEATHERSTACK_KEY`, exits with code 1 and a message that
  names the variable and not its value.
- NFR-04: `tsc` is strict and rejects enums, parameter properties and value imports of types.
  ESLint rejects explicit `any`.
- NFR-06: ESLint `no-restricted-imports` rejects a resolver → repository/adapter import, a
  service → resolver import, and any `./x.js` relative import.
- `pnpm dev` serves GraphiQL on `:4000/graphql` with a `health` query. The web shell on `:5173`
  renders the three placeholder routes and an API status line fetched through codegen →
  `execute()` → TanStack Query → Vite proxy.
- `pnpm test` starts a `postgres:18-alpine` Testcontainer and runs a smoke integration test.
  MSW fails any unmocked outbound request.
- Every commit passes `.githooks/pre-commit`: format, lint, typecheck, unit tests and the secret
  scan. CI on the PR is green: lint, typecheck, format check, codegen drift, test.
- The CLAUDE.md *Commands* section is filled in, and `context/test-plan.md` matches the names
  that were actually used.

## Scope

- In: everything in the roadmap's F-01 *Scope*. Also, from the decisions below: the
  Testcontainers `globalSetup` and a smoke integration test, and an API status line in the web
  layout.
- Out:
  - Drizzle schema, migrations, `resetDb` / `seedProperty`, `createTestApp` with a database,
    `FakeWeatherClient`, fixtures, states and error codes in `packages/shared` (all F-02).
  - The Weatherstack adapter and redaction helpers (S-01/S-02).
  - The weather timeout config value (S-02, TR-10).
  - Compose `api`/`web` services, Dockerfiles and the e2e job (S-06).
  - CORS, because dev uses the Vite proxy and production serving is decided in S-06.

## Findings

Repo state (2026-10-07): no code yet. Present: `.nvmrc` = `24`, `.gitignore`, `.env.example`
(`WEATHERSTACK_KEY=`, `WEATHERSTACK_BASE_URL=`), `.mcp.json`, `.claude/skills/`, `context/`,
`docs/`, and `docs/samples/weatherstack-current.json`. There is no `.claude/settings.json` yet.
Git is on `main`. The only uncommitted changes are this plan, its review and the roadmap
status edit, which are committed with phase 1. GitHub remote `KrzysztofSikora/property-manager`, issue #1.

Local toolchain:
- Node v24.21.0 is the nvm default (`nvm alias default 24`, set 2026-10-07). Shells that
  inherit an older PATH, such as this Claude Code session, which started on v20.20.2, still
  need `nvm use`. The pre-commit hook and the `engines` field must reject Node < 24 with a
  clear message, not an obscure syntax error.
- pnpm 12.9.1 (corepack 0.34.6), Docker 29.7, Compose v5.5.

Latest versions on npm (2026-10-07) match `context/tech-stack.md`: vitest 5.0.3,
@graphql-codegen/cli 7.4.5, typescript-resolvers 6.1.1, client-preset 6.2.2, graphql-yoga
5.24.2, eslint 10.12.0, typescript-eslint 8.71.1, vite 8.3.3, @vitejs/plugin-react 6.1.2,
@tailwindcss/vite 4.3.3, react-router 8.4.0, @tanstack/react-query 5.104.1, msw 3.0.2,
pino 10.4.0, @testcontainers/postgresql 12.2.0, @stryker-mutator/vitest-runner 10.0.0,
prettier 3.9.9, zod 4.6.5.

Library facts:
- **MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`.** Checked in the published
  msw@3.0.2 tarball: `lib/` contains only `onUnhandledFrame`, e.g.
  `server.listen({ onUnhandledFrame: 'error' })`. `context/test-plan.md` (TR-25, *Test data
  and isolation*, roadmap F-01 scope) uses the old name. Phase 5 updates it.
- **Vitest 5** (context7, vitest v5.0.3 docs): `test.workspace` is gone and `test.projects`
  is used instead. A project can be a config file path. `globalSetup` receives a
  `TestProject` and shares data with `project.provide('key', value)`. Tests read it with
  `inject('key')`, typed by augmenting `ProvidedContext` in `declare module 'vitest'`.
- **GraphQL Code Generator** (context7): the top-level `importExtension: '.ts'` option
  generates `.ts` relative imports for type-stripped Node. The client preset supports
  `documentMode: 'string'`. `typescript-resolvers` takes `mappers` and `contextType`.
- **ESLint 10** (context7, configuration-files and the v10 migration guide): `eslint.config.ts`
  is loaded through `jiti` >= 2.2 (an optional dev dependency). Native Node loading needs
  `--flag unstable_native_nodejs_ts_config`. ESLint does not type-check its config file.
- **ESLint flat config:** when two config objects set the same rule for a file, the later
  object's options replace the earlier one's. They are not merged. Each layer's
  `no-restricted-imports` entry must therefore repeat the `.js`-import pattern, which is built
  by one helper in `eslint.config.ts`.
- From `context/tech-stack.md` (tested 2026-10-07): `erasableSyntaxOnly` reports TS1294,
  `verbatimModuleSyntax` reports TS1484, `skipLibCheck` is needed for Yoga's `lru-cache` types,
  TS 6.0 defaults `types` to `[]`, and a workspace package symlink loads under type stripping.
- PRD § Weatherstack: the default base URL is `https://api.weatherstack.com`. FR-14 AC1 needs a
  `.env` with only the key, so every other variable needs a default, and an empty value (as
  in `.env.example`) must count as unset.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How do phase commits reach `main`? | Branch `feat/repo-skeleton`, one PR, merged with a merge commit (no squash) | CI proves itself on the PR. A merge commit keeps one commit per phase (CLAUDE.md). | user |
| Does the Testcontainers harness start in F-01? | Yes. `globalSetup` starts `postgres:18-alpine` and provides `databaseUrl`. A smoke test runs `select 1` and a Yoga in-process query. | Testcontainers in CI is the riskiest tooling piece, so it is proven early. No migrations yet. | user |
| Does the web shell call the API? | Yes. An API status line in the layout runs the `health` query. | Proves codegen → `execute()` → TanStack Query → Vite proxy now, not in S-04. | user |
| When do the hooks arrive? | Pre-commit hook, secret scan and Claude editor hook in phase 1. CI in phase 5. | Every later commit is gated. | user |
| Phase count | 5 phases (listed below) | Each phase is one reviewable diff. | user |
| Empty env values | An empty string counts as unset (then the default applies, or the variable is reported missing). | `.env.example` ships `WEATHERSTACK_BASE_URL=` blank, and FR-14 AC1 needs only the key. | research (PRD) |
| ESLint config format | `eslint.config.ts` loaded through `jiti` | Typed config. Works in editors without ESLint's unstable flag. | research (ESLint docs) |
| How violations are proven | A Vitest suite (`tooling/guardrails.test.ts`) that lints in-memory snippets with the ESLint Node API and runs `tsc` on fixture files | Proves the roadmap acceptance on every run, not once by hand. | research (roadmap acceptance) |
| Where `.env` lives | Repo root. The API loads it with `node --env-file-if-exists=../../.env` in dev. Tests never load it. | One `.env` for Compose and dev. The test plan requires the real key to stay out of tests. | research (test plan) |
| Last commit with `Closes #1` | The final `docs(repo-skeleton): close plan` commit | The implement skill puts the last hash edit in that commit, so it is the item's last commit. | research (implement skill) |

## Design

### Workspace

- Root `package.json`: `"private": true`, `"type": "module"`,
  `"packageManager": "pnpm@12.9.1"`, `"engines": { "node": ">=24" }`. Scripts:
  - `dev`: API and web in parallel.
  - `lint`, `typecheck`: recursive.
  - `format`, `format:check`: Prettier.
  - `codegen`: `graphql-codegen`.
  - `test:unit`, `test`.
  - `prepare`: `git config core.hooksPath .githooks`.
- `pnpm-workspace.yaml`: `packages: [apps/*, packages/*]`, plus pnpm 12 settings
  (`engineStrict: true`). pnpm 12 reads settings only from this file.
- Packages: `@property-manager/api`, `@property-manager/web`, `@property-manager/shared`.
  `shared` exports `./src/index.ts` directly (no build), consumed as `workspace:*`.
- Root `lint` is a single `eslint .` from the root, so the root config files and `tooling/`
  are covered. Root `typecheck` is `tsc -p . && pnpm -r typecheck`. `pnpm -r` alone skips the
  workspace root (review #4).
- `.prettierignore`: `.claude/` (skills Markdown, review 2 #1), `context/`, `docs/`,
  `ai-sessions/`, `CLAUDE.md`, `pnpm-lock.yaml`,
  `**/generated/`, `apps/web/src/graphql/` and `reports/`. Prettier formats code and config
  only, not the hand-written Markdown artifacts, which Prettier 3 would reflow (review #1).
- `packages/shared` scripts: `typecheck`, `test:unit` (`vitest run`), and `test:mutation`
  (`stryker run`, from phase 3). Its only Vitest config is `vitest.config.ts`.

### TypeScript

- `tsconfig.base.json`:
  - `strict`, `noUncheckedIndexedAccess`, `skipLibCheck`, `noEmit`.
  - `erasableSyntaxOnly`, `verbatimModuleSyntax`.
  - `module`/`moduleResolution: nodenext`, `allowImportingTsExtensions`,
    `rewriteRelativeImportExtensions`.
  - `target: esnext`, `types: ["node"]`.
- `apps/api` and `packages/shared` extend the base, so local imports end in `.ts` (nodenext
  requires an extension).
- `apps/web` extends the base but overrides `module: esnext`, `moduleResolution: bundler`,
  `jsx: react-jsx`, `types: ["vite/client"]`, and `lib` with DOM. Extensionless imports are
  allowed there. Erasable-only and verbatim module syntax stay on.
- Every tsconfig has an explicit `include` that covers each file `eslint .` reaches, because
  type-aware lint throws "was not found by the project service" otherwise (review 2 #3):
  - `apps/api`: `src`, `test`, `vitest.*.config.ts`.
  - `packages/shared`: `src`, `vitest.config.ts`.
  - `apps/web/tsconfig.json`: `src` (DOM, `vite/client` types).
  - `apps/web/tsconfig.node.json`: `vite.config.ts`, `vitest.config.ts`, with
    `types: ["node"]`. `typecheck` runs both web configs.
  - Root: see the next item.
- Root `tsconfig.json` covers the root config files (`eslint.config.ts`, `codegen.ts`,
  `vitest.config.ts`) and `tooling/`, with `"exclude": ["tooling/fixtures"]`. The fixtures are
  deliberately broken and only compiled by the guardrail test.

### ESLint (`eslint.config.ts`)

- Configs: `typescript-eslint` `strictTypeChecked` with `projectService`, React hooks rules for
  `apps/web`, then `eslint-config-prettier` last.
- Ignored: `**/generated/**`, `apps/web/src/graphql/**`, `tooling/fixtures/**`.
- `restrictImports(...extra)` builds `no-restricted-imports` with two separate pattern objects,
  because ESLint does not allow `regex` and `group` in one pattern: `{ regex: '^\\.{1,2}/.*\\.js$' }`
  for the `.js` ban, and `{ group: [...] }` for each layer's extra patterns:

| Files | May not import |
|-------|----------------|
| `apps/api/src/graphql/**` | `**/repositories/**`, `**/adapters/**`, `drizzle-orm*`, `pg` |
| `apps/api/src/services/**` | `**/graphql/**`, `graphql-yoga`, `graphql`, `drizzle-orm*`, `pg` |
| `apps/api/src/repositories/**`, `apps/api/src/adapters/**` | `**/services/**`, `**/graphql/**` |

  The composition root (`apps/api/src/app.ts`, `main.ts`) has only the base pattern.
- The layer folders don't exist until S-01. The guardrail test lints snippets with virtual
  file paths in those folders, with type-aware linting turned off for them (see
  *Guardrails*).

### Guardrails (`tooling/`)

- `tooling/guardrails.test.ts`:
  - The ESLint `lintText(code, { filePath })` cases expect `no-restricted-imports` for a
    resolver importing `../repositories/x.ts`, a service importing `../graphql/x.ts`, and
    `import { a } from './x.js'`. They expect `@typescript-eslint/no-explicit-any` for `any`.
  - The `ESLint` instance loads the real `eslint.config.ts` with an `overrideConfig` applying
    `tseslint.configs.disableTypeChecked`. None of these rules is type-aware, and without the
    override `projectService` throws "was not found by the project service" for virtual paths
    (review #3).
  - A control case: a resolver importing a service passes.
  - It spawns `tsc -p tooling/fixtures/tsconfig.json`, which extends the base, and expects
    TS1294 for `enum.ts` and `param-props.ts`, and TS1484 for `type-import.ts`.
  - Test names start with `NFR-04` / `NFR-06`.
- `tooling/secret-scan.ts`: a pure `findSecretLeaks(diff: string, key: string | undefined):
  Leak[]`, where `Leak = { file: string; line: number; kind: 'key' | 'access_key' }`. It
  checks only added lines (`+`) of a unified diff, skipping the `+++ b/<file>` header lines,
  which it uses to track the current file (review 2 #8).
  - `key`: the line contains the literal key value, if one is set and is at least 8 chars.
  - `access_key`: the line matches `access_key=[A-Za-z0-9]{16,}`, i.e. a key-like value.
    The project's real key is 32 lowercase hex chars (checked 2026-10-07 by length and charset
    only, never printed). `[REDACTED]`, `%5BREDACTED%5D`, a bare `access_key=` and short
    placeholders don't match. `TEST_WEATHERSTACK_KEY` doesn't match either (the `_` breaks the
    run). That keeps docs, the plan and S-02's redaction tests committable (review #2).
  - Tests build key-like positive inputs at runtime (e.g. `'access' + '_key=' + 'a'.repeat(32)`),
    so no committed file contains a literal that the rule flags.
  - CLI entry `tooling/secret-scan-cli.ts`: reads `WEATHERSTACK_KEY` from the root `.env`
    with its own line parser, never `process.env` printing. It runs `git diff --cached -U0`
    and prints only `file:line kind`, never the matched text. Exit 1 on any leak.
- `tooling/secret-scan.test.ts`: tables for both kinds, a removed line ignored, `[REDACTED]`,
  the sentinel and a 15-char value allowed, a 16-char value flagged, and the key absent from
  the formatted output.

### Hooks

- `.githooks/pre-commit` (POSIX sh):
  1. Fail with "Node 24 required (run `nvm use`)" if `node -v` major < 24.
  2. `prettier --check --ignore-unknown` and `eslint --no-warn-ignored` on staged files, so
     files in `.prettierignore` or ESLint's ignores (the `context/` Markdown) pass through.
     The file list comes from `git diff --cached --name-only --diff-filter=ACMR`, so a staged
     deletion is not passed to either tool (review 2 #8).
  3. `pnpm typecheck`, `pnpm test:unit`.
  4. `node tooling/secret-scan-cli.ts`.
- `.claude/settings.json`: a `PostToolUse` hook on `Edit|Write` runs
  `sh "$CLAUDE_PROJECT_DIR/tooling/claude-format-hook.sh"`. The wrapper checks that
  `node -v` is major 24 or higher. If not, it writes "editor hook skipped: Node 24 required
  (restart Claude Code after `nvm use`)" to stderr and exits 2, so the failure is visible
  instead of silent. Claude Code ignores other non-zero codes, and Node 20 fails on `.ts`
  syntax (review 2 #2). Otherwise it runs
  `node "$CLAUDE_PROJECT_DIR/tooling/claude-format-hook.ts"`. That script reads `tool_input.file_path` from the stdin
  JSON. It skips files Prettier/ESLint don't handle or ignore (the same `--ignore-unknown` /
  `--no-warn-ignored` flags) and files outside the repo. It runs
  `prettier --write` and then `eslint` on that one file. On lint errors it writes them to
  stderr and exits 2, so Claude sees them. This is advisory, because the edit already
  happened.

### API (`apps/api`)

- `schema.graphql`: `type Query { health: String! }`, a placeholder that S-01 replaces.
- `src/config/env.ts`:
  - `loadConfig(env: Record<string, string | undefined>): Config` runs a zod schema after
    mapping `''` to `undefined`. Fields:

| Variable | Config field | Rule | Default |
|----------|--------------|------|---------|
| `WEATHERSTACK_KEY` | `weatherstackKey` | required, non-empty | none |
| `WEATHERSTACK_BASE_URL` | `weatherstackBaseUrl` | URL | `https://api.weatherstack.com` |
| `DATABASE_URL` | `databaseUrl` | URL | `postgres://postgres:postgres@localhost:5432/property_manager` |
| `PORT` | `port` | int 1–65535 | `4000` |
| `LOG_LEVEL` | `logLevel` | pino level enum | `info` |

  - On failure it throws `ConfigError`, whose message lists each bad variable as
    `Missing required environment variable: X` or `Invalid environment variable: X (<reason>)`.
    The message is built from issue paths and our own wording, never zod's default message,
    which could echo the input.
  - `Config` is a readonly type inferred from the schema.
- `src/logger.ts`: `createLogger(level, destination?)` returns a pino `Logger`. The optional
  destination lets tests capture lines (`captureLogs` in F-02 builds on it).
- `src/graphql/context.ts`: `GraphQLContext = { requestId: string; logger: Logger }`.
- `src/graphql/resolvers.ts`: a `Resolvers` object typed by codegen. `health` returns `'ok'`.
- `src/graphql/generated/resolvers-types.ts`: codegen output, committed, excluded from lint.
- `src/app.ts`, the composition root: `createApp({ config, logger }): { yoga }`.
  - It builds the Yoga instance with `createSchema` from `schema.graphql` and the resolvers.
  - Yoga's `context` creates `requestId = crypto.randomUUID()` and a child logger
    `{ requestId }`.
  - A small Yoga plugin (`onExecute` / `onExecuteDone`) logs one `graphql operation` line
    per request through the child logger, with `operationName` and `durationMs`. It does not
    log variables, because S-01's create input is user data. This gives the phase 2 human
    check, and the leak tests from S-01 on, a line to inspect (review 2 #4).
  - Masked errors stay at Yoga's default.
  - S-01 extends it with services and adapters. Tests call `yoga.fetch` directly.
- `src/main.ts`:
  1. `loadConfig(process.env)`. On `ConfigError` it writes the message to stderr and exits 1.
  2. `createApp`, then `createServer(yoga).listen(config.port)`.
  3. It logs `listening` with the port (no config dump) and closes on SIGINT/SIGTERM.
- Scripts:
  - `dev`: `node --watch --env-file-if-exists=../../.env src/main.ts`.
  - `start`: `node src/main.ts`.
  - `typecheck`: `tsc -p .`.
  - `test:unit`: `vitest run -c vitest.unit.config.ts`.
  - `test:int`: `vitest run -c vitest.int.config.ts`.
  - `test:mutation`: `stryker run`.

### Codegen (root `codegen.ts`)

- Schema: `apps/api/schema.graphql`. Top-level `importExtension: '.ts'`.
- `apps/api/src/graphql/generated/resolvers-types.ts`:
  - Plugins `typescript` and `typescript-resolvers`.
  - `enumsAsTypes: true`, `useTypeImports: true`.
  - `contextType: '../context.ts#GraphQLContext'`.
- `apps/web/src/graphql/`:
  - Client preset with `documentMode: 'string'`, `enumsAsTypes: true`, `useTypeImports: true`.
  - Documents `apps/web/src/**/*.{ts,tsx}`.
- `hooks.afterAllFileWrite: ['prettier --write']`, so the output is deterministic for the drift
  check.
- If the client preset's own imports break under `bundler` resolution with `importExtension`,
  scope `importExtension` to the API output only. This is checked in phase 4.

### Tests (API)

- `apps/api/vitest.unit.config.ts`: `include: ['src/**/*.test.ts']`,
  `exclude: ['**/*.int.test.ts']`, `setupFiles: ['test/setup/msw.ts']`.
- `apps/api/vitest.int.config.ts`:
  - `include: ['test/integration/**/*.int.test.ts']`.
  - `globalSetup: ['test/setup/postgres.ts']` starts `PostgreSqlContainer('postgres:18-alpine')`
    and calls `project.provide('databaseUrl', uri)`. Teardown stops it. `ProvidedContext` is
    augmented.
  - `setupFiles: ['test/setup/msw.ts']`, `fileParallelism: false`, a longer `hookTimeout`.
- `test/setup/msw.ts`: an empty `setupServer()` with `listen({ onUnhandledFrame: 'error' })`,
  `resetHandlers` after each test, and `close` after all. It sets
  `process.env.WEATHERSTACK_KEY ??= 'TEST_WEATHERSTACK_KEY'` only where a test builds config
  from the environment. Tests mostly pass explicit env objects to `loadConfig`.
- `apps/api/stryker.config.json`:
  - `testRunner: vitest`, `vitest.configFile: vitest.unit.config.ts`.
  - `mutate: []`, so a run requires `--mutate` (CLAUDE.md scope rule).
  - `thresholds.break: null`, `reporters: [html, json, clear-text]`, report under
    `reports/mutation/`.
  - `packages/shared/stryker.config.json` is the same, except
    `vitest.configFile: vitest.config.ts`, since shared has only hermetic tests (review #8).
- Root `vitest.config.ts`: projects = `packages/shared/vitest.config.ts`,
  `apps/api/vitest.unit.config.ts`, `apps/api/vitest.int.config.ts`,
  `apps/web/vitest.config.ts` and a `tooling` project.
  - Root `test:unit` runs every project except the API integration one, by project name.
  - Root `test` runs all of them.

### Web (`apps/web`)

- `vite.config.ts`: `@vitejs/plugin-react`, `@tailwindcss/vite`, a dev server on `5173`, and
  `server.proxy['/graphql'] → http://localhost:4000`.
- `src/main.tsx`: `QueryClientProvider` and `BrowserRouter`.
- `src/app/routes.tsx`: `Layout` with the routes `/` (List placeholder),
  `/properties/new` (Create placeholder) and `/properties/:id` (Details placeholder that shows
  the id), plus a catch-all not-found route.
- `src/lib/execute.ts`:
  - `execute<TResult, TVariables>(document: TypedDocumentString<TResult, TVariables>,
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]):
    Promise<TResult>`.
  - It POSTs to `/graphql`. On a non-OK HTTP status or a non-empty `errors` it throws
    `GraphQLRequestError { status: number; errors: readonly { message: string; extensions?:
    Record<string, unknown> }[] }`.
  - The response body is narrowed from `unknown` with a small zod schema, with no casts.
- `src/components/ApiStatus.tsx`: `useQuery({ queryKey: ['health'], queryFn: () =>
  execute(HealthDocument), retry: false })`. It shows "API: checking…", "API: ok" or
  "API: unreachable". With `retry: false`, "unreachable" appears at once instead of after
  TanStack's default three retries (review #11).
- `src/test/setup.ts` (jest-dom matchers, MSW with `onUnhandledFrame: 'error'`),
  `src/test/msw.ts` (`server` plus `graphql.query('Health', ...)` default handler) and
  `src/test/render.tsx` (`renderWithProviders(ui, { route })` with a fresh
  `QueryClient({ defaultOptions: { queries: { retry: false } } })`).
- `vitest.config.ts`: `environment: 'jsdom'`.

### Compose and env

- `docker-compose.yml`: a `postgres` service (`postgres:18-alpine`, user/password/db matching
  the `DATABASE_URL` default, port `5432`, a `pg_isready` healthcheck, and a named volume
  mounted at `/var/lib/postgresql`, not `.../data`, because the postgres 18 image moved
  `PGDATA` under a versioned subdirectory (review 2 #6).
- `.env.example`: all five variables with a one-line comment each. Only `WEATHERSTACK_KEY` is
  required, and the others show their default commented out.

### CI (`.github/workflows/ci.yml`)

- Triggers: `push` to `main` only, and `pull_request`, so a PR push runs once (review 2 #9).
  One job on `ubuntu-latest`:
  1. checkout, `pnpm/action-setup` (reads `packageManager`), `actions/setup-node` with
     `node-version-file: .nvmrc` and the pnpm cache.
  2. `pnpm install --frozen-lockfile`.
  3. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
  4. `pnpm codegen`, then `git diff --exit-code` and an empty
     `git status --porcelain -- apps/api/src/graphql/generated apps/web/src/graphql`, so a
     newly generated untracked file also fails (review 2 #7).
  5. `pnpm test` with `env: WEATHERSTACK_KEY: TEST_WEATHERSTACK_KEY`.
- A concurrency group cancels superseded runs. Action major versions are checked at
  implementation time.

## Phases

### Phase 1: Workspace, static rules and commit gate

- First step: `git switch -c feat/repo-skeleton`.
- Files:
  - `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`: the workspace and root scripts.
    Contract: script names `lint`, `typecheck`, `format`, `format:check`, `test:unit`, `test`,
    `prepare`, and `engines.node >=24`.
  - `tsconfig.base.json`, `tsconfig.json`: the compiler flags from *Design*. Contract: the
    flag set every package extends.
  - `context/changes/repo-skeleton/{plan.md,plan-review.md}`, `context/roadmap.md`: the
    planning artifacts, committed with this phase (review 2 #10).
  - `eslint.config.ts`, `.prettierrc.json`, `.prettierignore`: lint and format rules.
    Contract: the `restrictImports` helper and the layer table.
  - `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`: an empty
    package (`export {}`) with `passWithNoTests`. Contract: export map `"." → ./src/index.ts`,
    and the scripts `typecheck` and `test:unit`.
  - `vitest.config.ts` (root, projects `shared` and `tooling` for now) and
    `tooling/{guardrails.test.ts,fixtures/*}`: the violation proofs.
  - `tooling/secret-scan.ts`, `tooling/secret-scan-cli.ts`, `tooling/secret-scan.test.ts`:
    the leak matcher and CLI. Contract: `findSecretLeaks(diff, key): Leak[]`.
  - `.githooks/pre-commit`: the commit gate.
  - `tooling/claude-format-hook.sh`, `tooling/claude-format-hook.ts`,
    `.claude/settings.json`: the editor hook with its Node version guard.
- Proves: NFR-04 (enum, parameter property, type import and `any` fail), NFR-06 (layer and
  `.js` rules fail, control case passes). Unit level (`tooling` project). TR-22. The
  pre-commit scan is part of TR-01.
- Agent checks: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
  `pnpm test:unit`. `git config core.hooksPath` prints `.githooks`.
- Human checks:
  - Generate a scratch file with a random 20-char value at check time (nothing key-like is
    written into this plan):
    `printf 'access_key=%s\n' "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)" > scratch.txt`.
    Stage it. `git commit` is blocked with only `scratch.txt:1 access_key` shown. Then unstage
    and delete the file.
  - After an agent edit, the editor hook output is visible in the session.

### Phase 2: API skeleton with config, logging, Yoga and server codegen

- Files:
  - `apps/api/{package.json,tsconfig.json,vitest.unit.config.ts,schema.graphql}`. Contract:
    `Query.health: String!`, and the scripts `dev`, `start`, `typecheck`, `test:unit`.
  - `codegen.ts` (root, API output only for now),
    `apps/api/src/graphql/generated/resolvers-types.ts` (committed). Contract: `Resolvers`
    typed with `GraphQLContext`, and the generated file passes `erasableSyntaxOnly`.
  - `apps/api/src/config/env.ts`, `env.test.ts`. Contract: `loadConfig(env): Config`,
    `ConfigError`, the variable table and the empty-string-is-unset rule.
  - `apps/api/src/logger.ts`. Contract: `createLogger(level, destination?)`.
  - `apps/api/src/graphql/{context.ts,resolvers.ts}`, `apps/api/src/app.ts`,
    `apps/api/src/main.ts`. Contract: `createApp({ config, logger }): { yoga }`, plus
    `requestId` and the child logger in the context.
  - `apps/api/src/main.test.ts`: spawns `process.execPath src/main.ts` with a child env that
    removes the key (`{ ...process.env, WEATHERSTACK_KEY: undefined }`), because CI sets the
    sentinel for the whole test step. A second case sets `WEATHERSTACK_KEY=''`, as shipped in
    `.env.example`. Both expect exit 1 and stderr naming the variable (review #5).
  - `apps/api/src/app.test.ts`: `yoga.fetch` runs `{ health }` and gets `ok`. With a
    logger writing to an in-memory destination, exactly one `graphql operation` line carries a
    UUID `requestId`, and two requests get different ids.
  - `apps/api/test/setup/msw.ts` (moved here from phase 3, review 2 #5): referenced by
    `vitest.unit.config.ts`. `apps/api/src/net-guard.test.ts` moves with it: TR-25, an
    unmocked `fetch('https://api.weatherstack.com/current')` rejects.
  - `vitest.config.ts`: adds the `api-unit` project. Root `package.json`: adds `codegen` and
    `dev`.
- Proves:
  - FR-14 AC3 (unit): `loadConfig({})` throws naming `WEATHERSTACK_KEY`. `main.ts` with no
    key exits 1, and stderr names `WEATHERSTACK_KEY`.
  - TR-18: an invalid `PORT` with a sentinel key → the message names `PORT` and does not
    contain the sentinel. The defaults apply when values are `''`.
  - The `health` query works in process, and each operation logs one line with its own
    `requestId`.
  - TR-25 (unit): an unmocked outbound request fails the test.
- Agent checks: `pnpm codegen` (no diff on a second run), `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit`.
- Human checks: with `WEATHERSTACK_KEY` set in `.env`, `pnpm --filter
  @property-manager/api dev` starts. GraphiQL at `http://localhost:4000/graphql` answers
  `{ health }` with `"ok"`. The log line carries a `requestId` and no key. With the key
  removed, startup fails naming the variable.

### Phase 3: API test harness (integration project, Testcontainers, MSW, Stryker)

- Files:
  - `apps/api/vitest.int.config.ts`, `apps/api/test/setup/postgres.ts`: the `globalSetup`.
    Contract: `inject('databaseUrl'): string`.
  - `apps/api/vitest.int.config.ts` also wires `test/setup/msw.ts` (created in phase 2).
    Contract: an unmocked request fails an integration test too.
  - `apps/api/test/integration/smoke.int.test.ts`: `pg` `select 1` on
    `inject('databaseUrl')`, and `yoga.fetch` `{ health }`.
  - `apps/api/stryker.config.json`, `packages/shared/stryker.config.json` and the
    `test:mutation` scripts in both packages. Contract: `mutate` is empty by default,
    `break: null`, and shared points at its `vitest.config.ts`.
  - `docker-compose.yml`: the postgres service. Root `vitest.config.ts`: adds `api-int`.
    Root `package.json`: `test` includes integration.
- Proves: the integration harness works (integration), and MSW guards integration tests too. TR-22's Stryker
  prerequisites are in place.
- Agent checks: `pnpm test` (Docker running), `pnpm test:unit` (no Docker needed),
  `pnpm --filter @property-manager/api test:mutation --dryRunOnly` (the config loads; no
  mutants, so the scope rule holds), `pnpm lint`, `pnpm typecheck`.
- Human checks: `docker compose up -d postgres` becomes healthy. Then
  `docker compose down`.

### Phase 4: Web shell

- Files:
  - `apps/web/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,index.html}`.
    Contract: dev on `:5173`, the `/graphql` proxy to `:4000`, and the scripts `dev`, `build`,
    `typecheck`, `test:unit`.
  - `apps/web/src/{main.tsx,index.css}`: the Tailwind 4 `@import "tailwindcss"` entry.
  - `apps/web/src/app/{routes.tsx,Layout.tsx}` and
    `apps/web/src/pages/{ListPage,CreatePage,DetailsPage,NotFoundPage}.tsx`. Contract: the
    routes `/`, `/properties/new`, `/properties/:id`, `*`.
  - `apps/web/src/lib/execute.ts`, `execute.test.ts`. Contract: the `execute()` signature and
    `GraphQLRequestError`.
  - `apps/web/src/components/ApiStatus.tsx`, `ApiStatus.test.tsx`, with the `Health`
    document.
  - `apps/web/src/graphql/` (client-preset output, committed). `codegen.ts`: adds the web
    output.
  - `apps/web/src/test/{setup.ts,msw.ts,render.tsx}`. Contract:
    `renderWithProviders(ui, { route })`.
  - Root `vitest.config.ts`: adds `web`.
- Proves (unit, Testing Library + MSW):
  - Each route renders its placeholder heading, and an unknown path shows not-found.
  - `execute` returns `data`, and throws `GraphQLRequestError` on an `errors` payload and on
    HTTP 500.
  - `ApiStatus` shows ok, or unreachable when the handler returns a network error.
- Agent checks: `pnpm codegen` (stable), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
  `pnpm --filter @property-manager/web build`.
- Human checks: `pnpm dev` (API and web). `http://localhost:5173` shows "API: ok", and the
  three routes render. With the API stopped, the status line shows "unreachable".

### Phase 5: CI, env template, docs and test-plan sync

- Files:
  - `.github/workflows/ci.yml`: the job in *Design*. Contract: the step order, and the
    sentinel key as the only key.
  - `.env.example`: all variables with comments.
  - `CLAUDE.md`: *Commands* filled in (install, dev, test:unit, test, lint, typecheck,
    format, codegen, mutation, the `nvm use` note).
  - `context/test-plan.md`:
    - `onUnhandledRequest` becomes `onUnhandledFrame`.
    - *Quality gates*, pre-commit row: the `access_key` rule becomes the key-like pattern
      from *Guardrails* (16+ alphanumerics), plus the literal-key check.
    - The API unit and integration config names become the real ones.
    - The root projects get a line.
    - TR-18, TR-22, TR-23 and TR-25 become `covered (F-01)`.
    - Any changed helper name is updated.
  - `context/roadmap.md`: the F-01 scope wording `onUnhandledRequest` becomes
    `onUnhandledFrame`. (The F-02 harness wording was already updated at planning time,
    review #9.)
- Proves: TR-23 (the codegen drift step in CI). CI green is the roadmap acceptance.
- Agent checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`. Run
  the codegen drift check (diff plus porcelain) locally. After the push, the CI run is watched with
  `gh run watch`.
- Human checks: open the PR for `feat/repo-skeleton` and confirm the CI checks are green. Read
  the CLAUDE.md *Commands* wording.

## Risks and unknowns

- **Node 20 default shell** (resolved by design): `engines` + `engineStrict` and the hook's
  version check fail loudly. The CLAUDE.md commands note `nvm use`.
- **Vitest 5 with `.ts` imports and `allowImportingTsExtensions`** (roadmap unknown): Vite
  resolves `.ts` specifiers natively. Not blocking. Phase 2's tests prove it on the first run.
- **Codegen output and `erasableSyntaxOnly`** (roadmap unknown): handled by `enumsAsTypes` and
  `useTypeImports`. The client preset's `importExtension` behaviour under `bundler` is checked
  in phase 4, with a fallback in *Design*. Not blocking.
- **Ports** (roadmap unknown): resolved. API `4000`, web `5173`, Postgres `5432`.
- **Type-aware ESLint on virtual paths in `lintText`** (resolved, review #3): `projectService`
  throws for files outside any tsconfig, so the guardrail test applies
  `tseslint.configs.disableTypeChecked`. The rules under test are not type-aware, and the
  real layer globs still apply to the virtual paths.
- **Testcontainers in CI:** `ubuntu-latest` has Docker. The first container pull adds time.
  This is accepted, and proven in phase 5's CI run.
- **The pre-commit hook makes commits slower** (typecheck + unit tests). Accepted. Integration
  tests are not in the hook.
- **Throwaway pieces:** `Query.health` and `ApiStatus` may be removed when S-01/S-04 land.
  That is accepted, because they prove wiring now.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Workspace, static rules and commit gate (a25205e)
- [x] Phase 2: API skeleton with config, logging, Yoga and server codegen (537d8aa)
- [x] Phase 3: API test harness (integration project, Testcontainers, MSW, Stryker) (d0abb88)
- [x] Phase 4: Web shell (7c2a89c)
- [x] Phase 5: CI, env template, docs and test-plan sync (d0a8fd0)

## Deviations
- Phase 1: `tooling/secret-scan.ts` also exports `formatLeaks(leaks)`, so the "key absent
  from the output" test covers the exact CLI formatting. A line with both the literal key and
  a key-like `access_key=` value reports one leak, `key`.
- Phase 1: the Node 24 nvm install had no `pnpm` shim. `corepack enable pnpm` was run once
  (local toolchain, nothing committed).
- Phase 1: pnpm 12 runs the root `prepare` script only when the install changes something,
  not on an up-to-date `pnpm install`. On a fresh clone it runs, so the design holds.
- Phase 2: `contextType` is `'../context.ts#GraphQLContext'`. The top-level `importExtension`
  does not rewrite that path (it generated `'../context'`), so the extension is spelled out.
- Phase 2: Envelop types the execute args as `any`. `app.ts` narrows `args.document` with an
  `isDocumentNode` guard and takes the operation name from the document via `getOperationAST`,
  because `args.operationName` is only the request parameter (`null` for `query Health {...}`
  sent without one). `createYoga<object, GraphQLContext>`: a `Record<string, unknown>` server
  context does not type-check against `createSchema`.
- Phase 2: `main.ts` wraps Yoga in `createServer((req, res) => { void yoga(req, res) })`,
  because `no-misused-promises` rejects passing the async handler directly.
- Phase 2: `net-guard.test.ts` also asserts the rejection's cause names `onUnhandledFrame`,
  so an offline machine cannot pass it by accident.
- Phase 2: pnpm resolved `@graphql-codegen/cli` 7.4.4 and `typescript-resolvers` 6.1.0 (one
  patch behind *Findings*). `@vitest/mocker` warns about an unmet optional `msw ^2.4.9` peer
  (browser mocking, unused).
- Phase 3: pnpm 12 blocked the Testcontainers install on build scripts of `ssh2`,
  `cpu-features` and `protobufjs` (optional native speedups). `pnpm-workspace.yaml` denies
  them in `allowBuilds` (`false`), so no third-party install script runs.
- Phase 3: both Stryker configs list `plugins: ["@stryker-mutator/vitest-runner"]`. The default
  `@stryker-mutator/*` glob is resolved next to `core` in pnpm's isolated store and finds no
  runner. `packages/shared` also sets `allowEmpty: true` (it has no tests yet, like its
  `passWithNoTests`). The API config does not, so a lost test suite still fails.
- Phase 3: with `mutate: []` and the vitest runner's default `related` mode, a bare
  `--dryRunOnly` on the API finds no tests and exits 1. The agent check ran as
  `test:mutation --dryRunOnly --mutate src/config/env.ts` (15 tests, 47 mutants). A run
  needs `--mutate` by design.
- Phase 3: `smoke.int.test.ts` adds a TR-25 case (unmocked `fetch` rejects with an
  `onUnhandledFrame` cause), so "MSW guards integration tests too" is proven by a test.
  `.stryker-tmp/` is added to `.gitignore` and the ESLint ignores. `packages/shared` gets its
  own `vitest` dev dependency for the Stryker runner.
- Phase 4: `@graphql-codegen/client-preset` is `^6.2.1` (locked 6.2.1). 6.2.2 and three of its
  `@graphql-codegen/*` dependencies were published on 2026-10-07, inside pnpm's
  `minimumReleaseAge`. pnpm auto-added a `minimumReleaseAgeExclude` bypass; it was reverted, so
  the policy has no exclusions.
- Phase 4: the client preset's `.ts` relative imports work under `bundler` resolution
  (`allowImportingTsExtensions` from the base), so the *Codegen* fallback is not needed. The
  output imports `@graphql-typed-document-node/core`, added as a web dev dependency.
  `@testing-library/dom` is added as the peer of `@testing-library/react`.
- Phase 4: MSW 3 has no top-level `graphql.query`, only `graphql.link(url).query(...)`, and
  imports come from `msw/graphql` and `msw/http`. `src/test/msw.ts` exports
  `api = graphql.link('/graphql')`; tests use `api.query(...)`. A GraphQL resolver's body is
  typed, so the HTTP 500 case returns a plain `Response`.
- Phase 4: `apps/web/tsconfig.json` is a solution file referencing `tsconfig.app.json` (`src`)
  and `tsconfig.node.json` (Vite/Vitest configs). The ESLint project service only discovers
  files named `tsconfig.json`, so a standalone `tsconfig.node.json` left the configs
  "not found by the project service". `typecheck` runs the two leaf configs.
- Phase 4: `execute()` checks the envelope with zod and narrows `data` with a type predicate
  `isResultOf(document, data)` (an object check) instead of an `as` cast. Field shapes come from
  the codegen document type. A missing or non-object `data` also throws `GraphQLRequestError`.
- Phase 4: React hooks lint is `eslint-plugin-react-hooks` `configs.flat['recommended-latest']`
  on `apps/web/src/**`. `ApiStatus` renders with `role="status"`.
- Phases 1–5: the F-01 Claude Code session exports are committed under `ai-sessions/`
  (`10-plan-F-01.txt` … `16-implement-F-01-5.txt`), with no secrets (scanned in review R5).
- Review fixes (`review.md` R1–R4):
  - R1: the codegen `afterAllFileWrite: prettier --write` hook is removed. Both output paths
    are in `.prettierignore`, so it never formatted anything. The output is deterministic,
    so the drift check doesn't need it.
  - R2: the secret scan reads `+++ ` as a file header only between `diff --git` and the first
    `@@`, so an added line whose content starts with `++ ` is scanned.
  - R3: pre-commit refuses a commit when a staged file also has unstaged changes, because
    Prettier and ESLint read the working tree.
  - R4: parse and validation failures also log one `graphql operation` line
    (`operationName: null`, `outcome: parse_error | validation_error`) through the root
    logger with a fresh `requestId`, since Yoga builds the context only after validation.
    Every line now carries `outcome` (`executed` for run operations).
