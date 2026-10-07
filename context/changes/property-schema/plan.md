# Plan: property-schema (F-02)

## Goal and end state

The `properties` table, its first migration and the test harness that S-01 – S-03 build on
are settled. No FR is complete here. This is groundwork for FR-08 AC2 (storage-enforced
uniqueness) and NFR-08 (no partial records). When F-02 is done:

- `pnpm test` runs the drizzle-kit migrations against the Testcontainers database in
  `globalSetup`, and the `properties` table exists with every column `NOT NULL`.
- Inserting two rows whose addresses differ only in the case of `street`/`city` violates
  `properties_address_unique` (pg `23505`). A row with a null required column is rejected
  (`23502`). A row breaking a range or format CHECK is rejected (`23514`).
- `id` defaults to PostgreSQL 18 `uuidv7()`, and `created_at` defaults to `now()` as
  `timestamptz`.
- `pnpm db:migrate` applies migrations to the dev database (`docker compose up -d postgres`)
  without needing `WEATHERSTACK_KEY`.
- `packages/shared` exports the 50 states + DC table and the FR-10 error-code list.
- The test helpers in the test-plan Cookbook exist under their documented names, except
  `FakeWeatherClient`, which moves to S-01 (decision below). The Cookbook and the CLAUDE.md
  *Commands* table match what was built.
- CI fails when `schema.ts` and the committed migrations drift apart.

## Scope

- In:
  - Drizzle schema, the first migration, `runMigrations()`, `pnpm db:migrate` and
    `pnpm db:generate`.
  - DB CHECK constraints. Migrations run in Testcontainers `globalSetup`.
  - A migration drift check in CI.
  - ESLint layer rules for `src/db/**`.
  - `packages/shared` states table and error codes.
  - Test helpers: `createTestApp`, `resetDb`, `seedProperty`, `countProperties`, `captureLogs`,
    `expectNoSecret`, `validInput`, `weatherstackResponse`, `weatherstackError`.
  - Test-plan Cookbook and CLAUDE.md updates.
- Out:
  - GraphQL SDL for `Property` and any resolver, service or repository (`PropertyRepository`
    is S-01).
  - The `WeatherClient` port, the real adapter, `FakeWeatherClient` / `withBarrier` (S-01).
  - The address zod schema and `normalizeAddress` (S-01, FR-07).
  - Migrating on API start-up and Compose `api` service (S-06).
  - Mapping `23505` to `PROPERTY_ALREADY_EXISTS` (S-02).

## Findings

Repo state (F-01, `e274868`):

- `apps/api/src/app.ts:77`: `createApp({ config, logger })` is the composition root. It has no
  database yet ("S-01 wires services, repositories and adapters here").
- `apps/api/src/config/env.ts:16-36`: `DATABASE_URL` is already parsed (`z.url()`, default
  `postgres://postgres:postgres@localhost:5432/property_manager`). `loadConfig` requires
  `WEATHERSTACK_KEY`, so a migrate command that reuses it would need the key.
- `apps/api/test/setup/postgres.ts:13-16`: `globalSetup` starts `postgres:18-alpine` and
  provides `databaseUrl`. It runs no migrations.
- `apps/api/vitest.int.config.ts`: `fileParallelism: false`, `hookTimeout: 120_000`, MSW
  setup file.
- `apps/api/src/logger.ts:5`: `createLogger(level, destination?)`, so `captureLogs` can pass an
  in-memory stream.
- `apps/api/test/integration/smoke.int.test.ts:22-38`: builds config and app by hand. This is
  what `createTestApp` replaces.
- `packages/shared/src/index.ts`: `export {}`. `packages/shared/package.json` exports
  `./src/index.ts` and has no dependencies.
- `eslint.config.ts:51-62`: layer rules ban `drizzle-orm*` and `pg` in `graphql/**` and
  `services/**`. Nothing covers a future `src/db/**` yet.
- `apps/api/package.json`: `pg` 8.23 is installed. `drizzle-orm` and `drizzle-kit` are not.
- `docs/samples/weatherstack-current.json`: the recorded `units=f` response (`location.lat`
  and `lon` are strings, `region: "Arizona"`), the only fixture source.
- `.prettierignore` has no entry for drizzle-kit output.
- No `context/lessons.md` exists yet.

Library facts (npm 2026-10-07; context7 `/drizzle-team/drizzle-orm-docs`; spike in a scratch
directory with `postgres:18-alpine`, Node 24 type stripping):

- Latest stable: `drizzle-orm` 0.45.3 and `drizzle-kit` 0.31.11. 1.0 is still `rc`/`beta`
  tags.
- `uniqueIndex('…').on(sql\`lower(${t.street})\`, sql\`lower(${t.city})\`, t.state, t.zipCode)`
  generates `CREATE UNIQUE INDEX "…" ON "properties" USING btree
  (lower("street"),lower("city"),"state","zip_code")`. This is verified output.
- `uuid().primaryKey().default(sql\`uuidv7()\`)` generates `DEFAULT uuidv7()`. On PG 18,
  `uuid_extract_version(id)` returned `7`.
- `check('name', sql\`…\`)` is emitted inside `CREATE TABLE`.
- drizzle-kit 0.31 (0.x) writes `drizzle/0000_<name>.sql` plus `meta/_journal.json` and
  `meta/0000_snapshot.json`. The folder-per-migration layout in the current docs is 1.0 only.
  drizzle-kit loads the schema through esbuild, so a schema file with `./x.ts` imports works.
- `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator` runs under
  Node type stripping. A second run is a no-op.
- **Surprise:** on a constraint violation Drizzle 0.45 throws `DrizzleQueryError` with
  `code === undefined`. The pg error, with `code: '23505'` and `constraint:
  'properties_address_unique'`, is on `.cause`. S-02 must read `error.cause`. Noted for the
  S-02 unknown in the roadmap.
- A null in a `NOT NULL` column gives pg `23502`.
- `jsonb().$type<T>()` affects types only, not SQL or runtime values.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| Id format (RQ-02) | UUID v7, `DEFAULT uuidv7()` | Time-ordered, so the FR-02 tiebreak by `id` follows insertion order. Built into PG 18, no extension. | user |
| DB enforcement beyond NOT NULL + unique index | CHECKs: `lat` −90…90, `long` −180…180, `zip_code ~ '^[0-9]{5}$'`, `state ~ '^[A-Z]{2}$'`, `jsonb_typeof(weather_data) = 'object' AND weather_data ? 'units' AND weather_data ? 'current'` | NFR-08 holds even if a bug skips zod. They are simpler than the zod rules on purpose: the full state list stays in `packages/shared`. | user |
| Which helpers F-02 builds | DB and data helpers now. `FakeWeatherClient` / `withBarrier` in S-01 with the port they implement. | F-02 would otherwise have to guess the `WeatherClient` interface before S-01 designs it. | user |
| Phase split | 3 phases: shared rules, schema + migrations, helpers | Each phase is one reviewable diff. | user |
| `lat`/`long` column type | `double precision` | `pg` returns `numeric` as a string, which needs parsing on every read. Weatherstack gives 3 decimals, so float precision is enough. | research |
| Column naming | Explicit snake_case names in `schema.ts` (`zip_code`, `weather_data`, `created_at`) | Drizzle's `casing` option would have to match in both `drizzle()` and `drizzle.config.ts`. Explicit names leave nothing to keep in step. | research |
| Unique index expression | `lower(street), lower(city), state, zip_code` | Matches the roadmap and D-07. Trimming and whitespace collapse happen before storage (S-01 `normalizeAddress`), and `state` is already upper-case (CHECK). | research (roadmap) |
| Migration tool flow | `drizzle-kit generate` writes SQL that is committed. The runtime applies it with `migrate()` from `drizzle-orm`. `drizzle-kit migrate` is not used. | One code path (`runMigrations`) for tests, dev and later Compose. drizzle-kit stays a devDependency. | research |
| Migrate command config | New `loadDatabaseConfig(env)` in `config/env.ts`, which parses only `DATABASE_URL` with the same rule and default | `pnpm db:migrate` must not need the Weatherstack key. Reusing the schema entry keeps one rule. | research |
| `seedProperty` path | Inserts through the Drizzle table directly, not `PropertyRepository` | The repository does not exist until S-01, and a seed helper should not depend on the code under test. Test-plan *Test data* wording is updated. | research |
| Migrations folder | `apps/api/drizzle/`, added to `.prettierignore` | drizzle-kit's default `out`. Its JSON is machine-written. | research |
| `weather_data` CHECK shape | Adds `jsonb_typeof(weather_data) = 'object'` before the key checks | jsonb `?` also matches string elements of an array, so `["units","current"]` would pass the key checks alone. One extra clause closes it. | plan review |
| Who may import `src/db/**` | Only repositories (and the test harness). Banned in `graphql/**`, `services/**` and `adapters/**`. | Adapters are third-party HTTP only (`tech-stack.md`). The shared repositories/adapters ESLint block is split so the ban applies to adapters alone. | plan review |
| Migrate CLI testability | `migrate-cli.ts` exports `runMigrateCli(env, stderr): Promise<0 \| 1>`. The entry runs it only under `import.meta.main` and sets `process.exitCode`. | The exit code and the no-URL rule can then be tested in process, without spawning Node. | plan review |
| Fate of `smoke.int.test.ts` | Edited in place, not renamed. The health case switches to `createTestApp`; the `select 1` and TR-25 cases stay. | Keeps the TR-25 reference in `test-plan.md` valid, and no second harness file is needed. | plan review |

## Design

### Shared (`packages/shared`)

- `src/states.ts`:
  - `US_STATES`: a readonly record of 51 entries (`AZ: 'Arizona'`, …, `DC: 'District of
    Columbia'`).
  - `type StateCode = keyof typeof US_STATES`.
  - `isStateCode(value: string): value is StateCode` is case-sensitive. Callers upper-case
    first, and S-01's zod schema does that.
  - `stateName(code: StateCode): string`.
- `src/errors.ts`:
  - `ERROR_CODES = ['BAD_USER_INPUT', 'PROPERTY_ALREADY_EXISTS', 'PROPERTY_NOT_FOUND',
    'WEATHER_QUOTA_EXCEEDED', 'WEATHER_UNAVAILABLE', 'WEATHER_LOCATION_MISMATCH',
    'INTERNAL_SERVER_ERROR'] as const`, plus `type ErrorCode`.
  - No enums (erasable syntax).
- `src/index.ts` re-exports both.

### Database (`apps/api/src/db/`)

- `schema.ts`: `properties` table.

  | Column | Type | Constraints |
  |--------|------|-------------|
  | `id` | `uuid` | PK, `DEFAULT uuidv7()` |
  | `street`, `city` | `text` | NOT NULL |
  | `state` | `text` | NOT NULL, CHECK `^[A-Z]{2}$` |
  | `zip_code` | `text` | NOT NULL, CHECK `^[0-9]{5}$` |
  | `lat` | `double precision` | NOT NULL, CHECK −90…90 |
  | `long` | `double precision` | NOT NULL, CHECK −180…180 |
  | `weather_data` | `jsonb` | NOT NULL, CHECK `jsonb_typeof = 'object'` and has keys `units` and `current` |
  | `created_at` | `timestamptz` | NOT NULL, `DEFAULT now()` |

  - Unique index `properties_address_unique` on
    `(lower(street), lower(city), state, zip_code)`.
  - `weather_data` is typed `$type<WeatherSnapshot>()`, with
    `WeatherSnapshot = { units: 'IMPERIAL'; current: Record<string, unknown> }` exported from
    `schema.ts`. S-01 may narrow `current` when it adds the mapper.
  - Exports `PropertyRow = typeof properties.$inferSelect` and
    `NewPropertyRow = typeof properties.$inferInsert`.
- `client.ts`: `createDb(databaseUrl: string): { db: Database; close(): Promise<void> }`
  using a `pg.Pool` and `drizzle({ client: pool })`. Exports `type Database`.
- `migrate.ts`: `runMigrations(databaseUrl: string): Promise<void>`. It opens its own
  single-connection pool, runs `migrate(db, { migrationsFolder })` with the folder resolved
  from `import.meta.url` (not the cwd), then closes the pool.
- `migrate-cli.ts`:
  - `runMigrateCli(env, stderr: (line: string) => void): Promise<0 | 1>` reads
    `loadDatabaseConfig(env)` and calls `runMigrations`.
  - On `ConfigError` it writes the config message (which names `DATABASE_URL`, not its value)
    and returns 1.
  - On a migration error it writes `Migration failed: <message>` with the URL and its
    password replaced by `[REDACTED]`, and returns 1. It never prints the URL, because the URL
    may hold a password.
  - Under `import.meta.main` it runs with `process.env` and `console.error`, and sets
    `process.exitCode`.
- `apps/api/drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/db/schema.ts'`,
  `out: './drizzle'`. `generate` does not need the DB URL.
- Layering: `src/db/**` belongs to the persistence layer. ESLint adds `**/db/**` to the
  banned groups for `graphql/**`, `services/**` and `adapters/**`. The current shared
  repositories/adapters block is split in two so that only adapters get the ban. Services get
  rows only through repositories (S-01).

### Test harness (`apps/api/test/`)

- `setup/postgres.ts`: after the container starts, `await runMigrations(uri)`, then
  `provide('databaseUrl', uri)`.
- `helpers/db.ts`:
  - `resetDb(db)` runs `TRUNCATE properties`.
  - `seedProperty(db, overrides?)` inserts a full valid row built from `validInput()` and
    the sample, with optional `createdAt`, and returns the `PropertyRow`.
  - `countProperties(db): Promise<number>`.
- `helpers/app.ts`: `createTestApp(): TestApp` returns
  `{ db, execute(document, variables?), logs(), close() }`.
  - It loads config with the sentinel key `TEST_WEATHERSTACK_KEY` and `inject('databaseUrl')`,
    a `captureLogs()` logger, `createDb`, and `createApp({ config, logger })`.
  - `execute` posts through `yoga.fetch` and returns `{ data, errors }`.
  - S-01 extends the options with `weather` and passes `db` into `createApp`.
- `helpers/logs.ts`: `captureLogs(): { logger, lines(): LogLine[] }`, a pino logger over an
  in-memory `Writable` that returns parsed JSON lines.
- `helpers/secrets.ts`:
  - `TEST_WEATHERSTACK_KEY` constant.
  - `expectNoSecret(...values: unknown[])` serializes each value (a GraphQL result, log
    lines) and fails if it contains the sentinel. The failure message never repeats the
    match context.
- `fixtures/property.ts`: `validInput(overrides?)` returns the canonical PRD address
  (`15528 E Golden Eagle Blvd`, `Fountain Hills`, `AZ`, `85268`).
- `fixtures/weatherstack.ts`:
  - `weatherstackResponse(overrides?)` deep-merges overrides into a fresh copy of
    `docs/samples/weatherstack-current.json`. An override value of `undefined` removes the
    key, so the TR-03 "missing field" cases can be built.
  - `weatherstackError(code, type, info?)` builds `{ success: false, error: { code, type,
    info } }`.
- Unit-testable helpers (`fixtures/*`, `secrets.ts`, `logs.ts`) get their tests under
  `apps/api/test/**/*.test.ts`. The `api-unit` include widens to cover them. DB helpers are
  tested in `api-int`.

### Error model

F-02 adds no API errors. `runMigrations` lets errors propagate, and `migrate-cli.ts` turns
them into exit 1. The `DrizzleQueryError.cause` finding is recorded for S-02.

## Phases

### Phase 1: Shared states and error codes

- Files:
  - `packages/shared/src/states.ts`: the states table and lookups. Contract: `US_STATES`
    (51 keys), `StateCode`, `isStateCode`, `stateName`.
  - `packages/shared/src/errors.ts`: the error-code list. Contract: `ERROR_CODES` (the 7 FR-10
    codes in table order), `ErrorCode`.
  - `packages/shared/src/index.ts`: re-exports both.
  - `packages/shared/src/states.test.ts`: tests for the 51 entries and the lookups.
  - `packages/shared/src/errors.test.ts`: checks that the FR-10 codes are present.
- Proves (unit, `shared` project): TR-09 groundwork. The table has exactly 51 codes, each a
  2-letter upper-case code with a non-empty name. `DC` → `District of Columbia`. `isStateCode`
  is true for `AZ` and `DC` and false for `PR`, `XX`, `az` and `Arizona`. `ERROR_CODES` equals
  the FR-10 list.
- Agent checks:
  - `pnpm vitest run --project shared`
  - `pnpm typecheck`
  - `pnpm lint`
- Human checks: none.

### Phase 2: Schema, migration and migrate command

- Files:
  - `apps/api/package.json`: adds `drizzle-orm` 0.45 (dep) and `drizzle-kit` 0.31 (devDep).
    Scripts: `db:generate` (`drizzle-kit generate`) and `db:migrate`
    (`node --env-file-if-exists=../../.env src/db/migrate-cli.ts`).
  - `package.json` (root): `db:migrate` and `db:generate` forward to the api package.
  - `apps/api/drizzle.config.ts`: drizzle-kit config. Added to `apps/api/tsconfig.json`
    `include`.
  - `apps/api/src/db/schema.ts`: the table, CHECKs and unique index. Contract: as in
    *Design*, plus `PropertyRow`, `NewPropertyRow` and `WeatherSnapshot`.
  - `apps/api/src/db/client.ts`: `createDb`, `Database`.
  - `apps/api/src/db/migrate.ts`: `runMigrations(databaseUrl)`.
  - `apps/api/src/db/migrate-cli.ts`: `runMigrateCli` and the `import.meta.main` entry.
    Exit 0 on success, 1 on a config or migration error, and the URL is never printed.
  - `apps/api/src/db/migrate-cli.test.ts`: unit tests for the failure paths (below). No
    Docker needed.
  - `apps/api/drizzle/0000_create_properties.sql` and `apps/api/drizzle/meta/*`: generated by
    `pnpm db:generate --name create_properties`. Commit the output.
  - `apps/api/src/config/env.ts`: `loadDatabaseConfig(env): { databaseUrl }`. It reuses the
    `DATABASE_URL` rule, default and messages. `loadConfig` behaviour is unchanged.
  - `apps/api/src/config/env.test.ts`: tests for `loadDatabaseConfig`. Without
    `WEATHERSTACK_KEY` it succeeds; with an invalid URL it gives a `ConfigError` naming
    `DATABASE_URL`; when unset it uses the default.
  - `apps/api/test/setup/postgres.ts`: runs `runMigrations` before `provide`.
  - `apps/api/test/helpers/db.ts`: `resetDb` and `countProperties` (moved here from Phase 3,
    because the schema test needs them). `seedProperty` is added in Phase 3.
  - `apps/api/test/integration/schema.int.test.ts`: constraint tests (below). `beforeEach`
    calls `resetDb`.
    - Rows that do not fit `NewPropertyRow` (a missing required column, `weather_data` `{}`
      or an array) go through a local `insertRaw(row: Record<string, unknown>)`. It builds a
      parameterised `INSERT` from the row's keys and runs it on a `pg.Client`, so the pg error
      (with `code`) is thrown directly.
    - Well-typed rows go through Drizzle `db.insert`, and the test reads the code from
      `error.cause`.
    - No casts to `any`.
  - `eslint.config.ts`: adds `**/db/**` to the banned groups for `graphql/**`, `services/**`
    and `adapters/**`. Splits the repositories/adapters block so repositories may import it.
  - `tooling/guardrails.test.ts`: two more cases. A service importing `../db/schema.ts`
    fails lint, and so does an adapter. A repository importing it passes.
  - `.prettierignore`: adds `apps/api/drizzle/`.
  - `.github/workflows/ci.yml`: a "Migration drift" step runs `pnpm db:generate` and then
    fails if `git status --porcelain -- apps/api/drizzle` is non-empty.
- Proves (integration, `api-int`, Testcontainers):
  - The roadmap F-02 acceptance:
    - The migration applies to an empty database. The `properties` table and
      `properties_address_unique` exist (checked in `pg_indexes`).
    - Inserting the canonical row, then the same with `street` lower-cased and `city`
      upper-cased, fails with `cause.code === '23505'` and `cause.constraint ===
      'properties_address_unique'`. This is FR-08 AC2 groundwork, TR-06 storage half.
    - Inserting a row without each required column fails with `23502` (`it.each` over
      street, city, state, zip_code, lat, long, weather_data). This is NFR-08, TR-05 schema
      half.
  - The CHECKs: `it.each` over lat 90.1, long −180.1, zip `8526`, state `az`, `weather_data`
    `{}` and `weather_data` `["units","current"]` → `23514`. Boundary values lat ±90 and
    long ±180 are accepted.
  - A row inserted without `id`/`created_at` gets a v7 UUID (`uuid_extract_version = 7`)
    and a `created_at` within the last minute.
  - A different zip with the same street and city is accepted (the index is not on street
    alone).
  - FR-08 AC3 groundwork: after deleting the row, the same address inserts again.
  - Unit (`api-unit`): `loadDatabaseConfig`, and the guardrail tests for the db import ban.
  - Unit (`api-unit`), migrate CLI failure paths (CLAUDE.md no-secrets rule):
    - `DATABASE_URL=postgres://u:<sentinel>@127.0.0.1:1/x` (nothing listens) returns 1, and
      no captured stderr line contains the sentinel.
    - `DATABASE_URL=not-a-url` returns 1, stderr names `DATABASE_URL`, and `runMigrations` is
      never reached.
- Agent checks:
  - `pnpm vitest run --project api-int`
  - `pnpm vitest run --project api-unit --project tooling`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm format:check`
  - `pnpm db:generate` prints "No schema changes" after the commit.
- Human checks:
  - `docker compose up -d postgres && pnpm db:migrate` succeeds on the dev DB, and a second
    run is a no-op.
  - The generated SQL in `apps/api/drizzle/0000_create_properties.sql` reads as intended:
    constraint names and the index expression.

### Phase 3: Test helpers and documentation

- Files:
  - `apps/api/test/helpers/secrets.ts`: `TEST_WEATHERSTACK_KEY`, `expectNoSecret`.
  - `apps/api/test/helpers/logs.ts`: `captureLogs`.
  - `apps/api/test/helpers/db.ts`: adds `seedProperty` (`resetDb` and `countProperties`
    came in Phase 2).
  - `apps/api/test/helpers/app.ts`: `createTestApp`. Contract:
    `{ db, execute, logs, close }`.
  - `apps/api/test/fixtures/property.ts`: `validInput`.
  - `apps/api/test/fixtures/weatherstack.ts`: `weatherstackResponse`, `weatherstackError`.
  - `apps/api/test/helpers/*.test.ts` and `apps/api/test/fixtures/*.test.ts`: hermetic helper
    tests.
  - `apps/api/vitest.unit.config.ts`: `include` adds `test/**/*.test.ts`. `*.int.test.ts`
    stays excluded.
  - `apps/api/test/integration/smoke.int.test.ts` (edited in place, not renamed): the health
    case uses `createTestApp` instead of the hand-built config and app. A new case checks that
    `seedProperty` then `countProperties` gives 1 and that `resetDb` gives 0. The `select 1`
    and TR-25 cases stay unchanged.
  - `context/test-plan.md`:
    - Cookbook: helper paths and names as built. `FakeWeatherClient` / `withBarrier`, the
      `createTestApp({ weather })` option (fake or `'msw'`) and `app.weather` are marked
      "added in S-01". F-02's `createTestApp()` takes no options.
    - *Test data*: `seedProperty` inserts through the table, not the repository.
    - TR-05 and TR-06 rows: note the storage halves that F-02 covers.
  - `CLAUDE.md` *Commands*: `pnpm db:migrate`, `pnpm db:generate` (commit the output).
  - `context/roadmap.md`: S-02 *Unknowns* note that the pg error sits on
    `DrizzleQueryError.cause` (resolved in F-02).
- Proves:
  - `expectNoSecret` fails on a value containing the sentinel, and on a nested log line
    holding it. It passes on `access_key=[REDACTED]`. (Unit; TR-01 tooling.)
  - `captureLogs` returns the parsed line with its fields. (Unit.)
  - `weatherstackResponse()` deep-equals the sample. An override changes only that path.
    `undefined` removes a key. Two calls do not share state. (Unit; TR-03 tooling.)
  - `weatherstackError(104, 'usage_limit_reached')` has `success: false` and the code.
    (Unit.)
  - `createTestApp().execute('{ health }')` returns `{ data: { health: 'ok' } }` against the
    migrated DB. Seed, count and reset work. (Integration.)
- Agent checks:
  - `pnpm test` (Docker running)
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm format:check`
  - `grep` shows that every Cookbook helper name exists in `apps/api/test/`, except the
    S-01 ones.
- Human checks: read the updated test-plan Cookbook for accuracy.

## Risks and unknowns

- Resolved: Drizzle 0.45 expression-index syntax and drizzle-kit output, `uuidv7()`
  default, migrate under type stripping, and where the pg error code surfaces (spike, see
  *Findings*).
- Testcontainers start-up time per suite: one container per run (F-01), plus one migration of
  a single table. This is negligible, and no action is needed.
- Hand-editing a generated migration would break drift detection. The rule: change
  `schema.ts` and regenerate, never edit SQL by hand. The CI drift step enforces it.
- `drizzle-kit generate` in CI needs no database. The spike ran it with no `dbCredentials`
  set, because it reads only the schema and the journal. Resolved.
- Mutation: Phase 1 touches the target `packages/shared/src/states.ts`, and Phase 2 touches
  `apps/api/src/config/env.ts`. `/mutation property-schema` covers both. The SQL in
  `schema.ts` is not a target (Testcontainers-only).
- No BLOCKING unknowns.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [ ] Phase 1: Shared states and error codes
- [ ] Phase 2: Schema, migration and migrate command
- [ ] Phase 3: Test helpers and documentation

## Deviations
<filled during implementation>
