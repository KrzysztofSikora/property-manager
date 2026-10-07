# Roadmap

Sources: `context/prd.md` (FR-, NFR-, OQ-, US- IDs), `context/tech-stack.md`,
`context/shape-notes.md` (R- IDs). Every Must FR maps to at least one item below. Items are
deliberately few (8) to keep the per-item process overhead (plan, review, mutation, session
export) proportionate to a small app.

## Overview

| ID | Issue | change-id | Type | Covers | Depends on | Size | Status |
|----|-------|-----------|------|--------|------------|------|--------|
| F-01 | #1 | repo-skeleton | foundation | FR-14 AC3, NFR-04, NFR-06 | - | M | done |
| F-02 | #2 | property-schema | foundation | (FR-08 AC2, NFR-08 groundwork) | F-01 | S | done |
| S-01 | #3 | create-property-with-weather | slice | FR-05 (AC1–AC3, AC6), FR-07, FR-10 | F-02 | M | done |
| S-02 | #4 | create-property-guards | slice | FR-05 (AC4, AC5), FR-06, FR-08, FR-10 | S-01 | M | done |
| S-03 | #5 | query-and-delete-properties | slice | FR-01, FR-02, FR-03, FR-04, FR-09, FR-10 | S-01 | M | in-progress |
| S-04 | #6 | list-and-details-pages | slice | FR-11 (Must ACs), FR-12 (AC1–AC5) | S-03 | M | todo |
| S-05 | #7 | create-property-page | slice | FR-13 | S-02, S-04 | M | todo |
| S-06 | #8 | run-and-document | slice | FR-14 (AC1, AC2), FR-15 | S-05 | M | todo |

Order follows risk: tooling and schema first, then the Weatherstack integration (the only
third-party unknown, R-01 – R-05) and the concurrency-sensitive duplicate rule, then the
read/delete API, then the UI, then packaging.

**Why API slices before UI slices.** S-01 – S-03 are vertical through resolver → service →
repository/adapter → PostgreSQL and are demonstrable in GraphiQL, which is the brief's core
deliverable (B-O2). The UI slices (S-04, S-05) are vertical through their routes on top of a
finished API. Building the API first lets the UI consume generated types from a stable schema
instead of chasing it, and keeps each session focused on one layer's test tooling (Testcontainers
+ fake adapter vs. MSW + Testing Library).

**Hosting and CI (resolves OQ-06 / Q-06).** GitHub, remote
`KrzysztofSikora/property-manager`. GitHub Actions is added in F-01: install, lint, typecheck
and `pnpm test` (Testcontainers runs on `ubuntu-latest` Docker). S-06 adds the Playwright e2e
job. Stryker is not in CI; it runs per change on test-plan targets.

**AI sessions (FR-15).** Delivered incrementally: every skill run is exported to `ai-sessions/`
as `NN-<change-id>-<step>.txt` (running number `NN`, as already used for `00`–`06`). S-06 checks
that every item has its exports and links them from the README.
Commits reference their issue with `Refs #<n>`; the last commit of an item uses `Closes #<n>`.

## Items

### F-01 Repo skeleton (`repo-skeleton`)
- Goal: a workspace where lint, typecheck, test and dev commands run on an empty app, with the
  type-stripping and layering rules enforced by tooling from the first commit.
- Covers: FR-14 AC3 (env config parsed with zod, fail fast naming the missing variable),
  NFR-04 (strict TS, no `any`), NFR-06 (ESLint `no-restricted-imports` layer rules).
- Scope:
  - pnpm 12 workspaces `apps/api`, `apps/web`, `packages/shared`; `.nvmrc`; `pnpm-workspace.yaml`.
  - TS 6.0 tsconfigs with the type-stripping flags; ESLint flat config (`strictTypeChecked`,
    `.js`-import ban, layer boundaries); Prettier.
  - API: Yoga on `node:http` with a placeholder query, pino with request id in context, config
    module (zod-parsed env, key presence only), composition root.
  - Web: Vite 8 + React 19 + React Router 8 + TanStack Query + Tailwind 4 shell with the three
    routes as placeholders and the typed `execute()` wrapper.
  - GraphQL Code Generator for server resolver types and web client preset.
  - Vitest in both apps; `docker-compose.yml` with `postgres` only; `.env.example`.
  - Test tooling assumed by `context/test-plan.md`: `vitest.unit.config.ts` (hermetic only) and
    an integration config (`*.int.test.ts`, Testcontainers `globalSetup`,
    `fileParallelism: false`); `test:unit`, `test` and `test:mutation` scripts; MSW setup with
    `onUnhandledFrame: 'error'`.
  - `.githooks/pre-commit` (enabled through `core.hooksPath`) with format, lint, typecheck,
    unit tests and the staged-diff secret scan; Claude Code editor hook running Prettier +
    ESLint on the edited file.
  - GitHub Actions CI (lint, typecheck, codegen drift check, test).
  - Fill the *Commands* section of CLAUDE.md.
- Depends on: -
- Acceptance: FR-14 AC3; NFR-04; a deliberate resolver → repository import and a `./x.js` import
  both fail lint; an enum fails `tsc`; CI is green on the skeleton.
- Unknowns: Vitest 5 + type-stripped `.ts` imports with `allowImportingTsExtensions`; codegen
  output passing `erasableSyntaxOnly` (`enumsAsTypes`, `useTypeImports`); exact ports.
- Size: M

### F-02 Property schema (`property-schema`)
- Goal: the `properties` table and migrations settled early, because the id format, the
  `jsonb` snapshot and the normalized-address unique index are expensive to change later.
- Covers: groundwork for FR-08 AC2 (storage-enforced uniqueness) and NFR-08 (all required
  columns `NOT NULL`); no FR is complete on its own.
- Scope: Drizzle schema (`id`, address fields, `lat`, `long`, `weather_data jsonb` holding
  `{ units, current }`, `created_at timestamptz`), unique index on
  `lower(street) + lower(city) + state + zip`, drizzle-kit migration and a migrate command;
  migrations run in the Testcontainers `globalSetup` (the harness itself lands in F-01, see
  `context/changes/repo-skeleton/plan.md`); `packages/shared` with the 50 states
  + DC table (code → name) and the error-code list; test helpers from the test-plan Cookbook
  (`createTestApp`, `resetDb`, `seedProperty`, `FakeWeatherClient` incl. `withBarrier`,
  `weatherstackResponse` / `weatherstackError` fixtures, `captureLogs`, `expectNoSecret`);
  update the test-plan Cookbook if names change.
- Depends on: F-01
- Acceptance: migration applies to an empty Testcontainers database; inserting two rows whose
  addresses differ only in case/whitespace (already normalized) violates the unique index; a row
  with a null required column is rejected.
- Unknowns: id format (UUID v7 via PostgreSQL 18 `uuidv7()` vs `gen_random_uuid()`; v7 also
  gives a natural tiebreak for FR-02); Drizzle 0.45 expression-index syntax and drizzle-kit
  output for it; Testcontainers start-up time per suite.
- Size: S

### S-01 Create property with weather (`create-property-with-weather`)
- Goal: `createProperty` stores a validated, normalized property with the weather snapshot and
  coordinates from one Weatherstack call — the happy path end to end.
- Covers: FR-05 AC1–AC3, AC6; FR-07 (shared zod address schema used at the resolver boundary);
  FR-10 base (error formatter: `BAD_USER_INPUT` with `extensions.fields`, masked
  `INTERNAL_SERVER_ERROR`); NFR-05, NFR-07, NFR-08.
- Scope: SDL for `Property`, `WeatherData { units, current }`, `CurrentWeather` (Must key fields
  + `raw: JSON`), `createProperty`; resolver → `PropertyService` (validate → weather → save) →
  `PropertyRepository.insert` / `WeatherClient`; real `WeatherClient` happy path (`fetch`,
  `AbortSignal.timeout(5000)`, zod-parsed response with key fields required, `units=f`, URL
  redaction) plus a fake for service/resolver tests; mapping the stored `current` to the typed
  key fields (snake_case → camelCase).
  Also a minimal `property(id)` (repository `findById`, malformed id → `null`) so FR-05 AC1's
  re-read is proven through the API (decided in the S-01 plan).
- Depends on: F-02
- Acceptance: FR-05 AC1, AC2, AC3, AC6; FR-07 AC1–AC5; FR-10 AC2.
- Unknowns: JSON scalar for `raw` (`graphql-scalars` vs a small custom scalar) and its codegen
  type (`unknown`, not `any`); nullability of non-key `current` fields (OQ-03) stays optional.
- Size: M

### S-02 Create property guards (`create-property-guards`)
- Goal: every way a create can be refused — Weatherstack failure, region mismatch, duplicate
  address — yields a specific, safe error, saves nothing, and leaks no key; duplicates cost no
  Weatherstack call, even under concurrent creates.
- Covers: FR-05 AC4 (region mismatch) and AC5; FR-06 AC1–AC7; FR-08 AC1–AC3; FR-10 rows
  `WEATHER_QUOTA_EXCEEDED`, `WEATHER_UNAVAILABLE`, `WEATHER_LOCATION_MISMATCH`,
  `PROPERTY_ALREADY_EXISTS`; NFR-01, NFR-02, NFR-03.
- Scope:
  - Adapter error classification, tested with MSW at HTTP level: codes 104, 101, 105, 615, other
    `success: false`, HTTP 429, non-2xx, network error, timeout, body missing key fields.
  - Region check in the service using the shared states table; configuration-error log entry;
    tests that capture logs and responses and assert the key string is absent.
  - Duplicate pre-check (`existsByNormalizedAddress`) before the weather call; mapping the
    unique-index violation (pg `23505`) on insert to `PROPERTY_ALREADY_EXISTS`; concurrency
    test against Testcontainers.
- Depends on: S-01
- Acceptance: FR-05 AC4, AC5; FR-06 AC1–AC7; FR-08 AC1, AC2 (AC3 through a repository-level
  delete here, end to end in S-03); FR-10 AC1 for the four codes above.
- Unknowns: OQ-04 — Weatherstack error codes and quota are UNVERIFIED; confirm against current
  Weatherstack docs while planning (see RQ-04); body shape of the HTTP 429 response; whether
  `region` for DC is "District of Columbia" (R-03); how Drizzle 0.45 surfaces the `pg` error
  (resolved in F-02: a `DrizzleQueryError` whose `code` is undefined, with the pg error, `code`
  and `constraint`, on `.cause`); making the concurrent test deterministic.
- Size: M (upper end; the plan may split it into two phases/commits)

### S-03 Query and delete properties (`query-and-delete-properties`)
- Goal: list (all by default), sort, filter, optionally page, fetch single properties and delete
  them through GraphQL, with zero weather calls.
- Covers: FR-01 AC1–AC6; FR-02 AC1–AC3; FR-03 AC1–AC6; FR-04 AC1–AC4; FR-09 AC1–AC3; FR-10
  row `PROPERTY_NOT_FOUND`; re-verifies FR-08 AC3 through the API.
- Scope: `properties(filter, sort, limit, offset): PropertyPage` and `property(id)`; zod args
  (`limit` optional, 1–100 when given; `offset` ≥ 0, default 0; blank filters dropped, state
  upper-cased); repository query with `ILIKE` contains on city (escaping `%`/`_`), exact
  state/zip, ordering by `created_at` then `id`, `count(*)` with the same filter; invalid id
  format → `null` (the minimal `property(id)` path lands in S-01; S-03 adds the FR-04 AC tests). `deleteProperty(id): ID!` through service and repository; unknown or
  malformed id → `PROPERTY_NOT_FOUND`.
- Depends on: S-01 (stored properties; tests seed through the repository)
- Acceptance: FR-01 AC1–AC6, FR-02 AC1–AC3, FR-03 AC1–AC6, FR-04 AC1–AC4, FR-09 AC1–AC3;
  FR-10 AC1 for `PROPERTY_NOT_FOUND`; FR-08 AC3 end to end.
- Unknowns: count + rows in one round trip vs. two queries; tie-breaking semantics depend on the
  F-02 id decision (RQ-02).
- Size: M

### S-04 List and details pages (`list-and-details-pages`)
- Goal: the `/` route lists all properties with sort, filters and delete; the
  `/properties/:id` route shows the full record and the key weather fields.
- Covers: FR-11 AC1, AC2, AC3, AC5, AC6, AC7; FR-12 AC1–AC5; NFR-09 for both views.
- Scope:
  - List: table of all matches (no `limit`), sort control, city/state/zip filter inputs in
    component state, native `<dialog>` delete confirmation with
    `invalidateQueries(['properties'])`, loading / empty / error-with-retry states, row link to
    details.
  - Details: address, coordinates with the city-level precision note, creation date, key
    weather fields with units (temperature, feels-like, description + icon, wind speed and
    direction, humidity), not-found state, delete with return to the list, missing optional
    fields omitted.
  - MSW GraphQL handlers and Testing Library in tests.
- Depends on: S-03
- Acceptance: FR-11 AC1, AC2, AC3, AC5, AC6, AC7; FR-12 AC1–AC5.
- Unknowns: debouncing filter input vs. submit-on-enter; testing native `<dialog>` in jsdom
  (`showModal` support).
- Size: M

### S-05 Create property page (`create-property-page`)
- Goal: the `/properties/new` route creates a property and lands on its details page, with a
  dedicated message for every create error.
- Covers: FR-13 AC1–AC4; NFR-09 (every FR-10 code has a UI message).
- Scope: four-field form validated with the shared zod schema, pending state, success redirect,
  mapping of `BAD_USER_INPUT` `extensions.fields` to field messages and of the other codes to
  form-level messages, values kept on error.
- Depends on: S-02 (error codes exist), S-04 (redirect target)
- Acceptance: FR-13 AC1–AC4.
- Unknowns: none significant.
- Size: M

### S-06 Run and document (`run-and-document`)
- Goal: a fresh clone starts with one command, is documented, and the AI deliverables are
  complete and linked.
- Covers: FR-14 AC1, AC2; FR-15 AC1, AC2; NFR-10.
- Scope: Compose services `api` (migrate, then start under type stripping) and `web` (Vite build
  served statically); Playwright e2e smoke (create → list → details → delete) against the
  Compose stack with `WEATHERSTACK_BASE_URL` pointed at a stub server; e2e job in CI; README
  (prerequisites, setup, start command, dev workflow, tests, env variables, no-auth statement,
  coordinate-precision note, quota/HTTPS notes, a "Decisions beyond the brief" section with the
  rationale for duplicate blocking (FR-08), the region vs. state check (FR-05 AC4), 50 states +
  DC only (NG-05), imperial units (D-08) and optional `limit`/`offset` defaulting to all
  (FR-01), links to the AI setup and `ai-sessions/`).
- Depends on: S-05
- Acceptance: FR-14 AC1, AC2; FR-15 AC1, AC2; PRD success criteria 1–7 walk-through.
- Unknowns: pnpm workspace install inside the API image (symlinked `packages/shared` under type
  stripping was tested, the Dockerfile layering is not); serving the SPA with client-side routes
  (fallback to `index.html`); where the stub Weatherstack runs in Compose for e2e.
- Size: M

## Later

Should items from the PRD, picked up only after S-06 is `done`:

- #9 FR-11 AC3a: list filters reflected in the URL query string (`useSearchParams`, zod-parsed),
  so a reload keeps them.
- #10 FR-11 AC4: UI pagination (20 per page, page indicator and total) using the API's
  `limit`/`offset`.
- #11 FR-12 AC6: details page shows observation time, pressure, precipitation, cloud cover, UV
  index, visibility, and `astro` / `airQuality` when present.
- #12 Data model: typed non-key `CurrentWeather` fields, including the `astro` and `airQuality`
  objects (until then they are available only in `current.raw`).

Could:

- #13 FR-16 Demo seed data (Q-04): a documented, never-automatic seed command that creates a few
  real Zillow addresses through `createProperty`. Uses real quota (R-01).

## Open roadmap questions

- RQ-01 — Resolved 2026-10-07: GitHub (`KrzysztofSikora/property-manager`), CI in GitHub
  Actions.
- RQ-02 — Resolved 2026-10-07 (F-02 plan): UUID v7 via `uuidv7()`. Original: UUID v7 (`uuidv7()`, built into PostgreSQL 18, time-ordered) is the
  default proposal; confirm in the F-02 plan, since S-03's tiebreak depends on it.
- RQ-03 — Resolved 2026-10-07: session exports go to `ai-sessions/` as
  `NN-<change-id>-<step>.txt`.
- RQ-04 Real Weatherstack calls during S-02 planning (OQ-04): how many manual calls the quota
  allows for verifying error codes (104 can't be triggered safely; rely on docs).
- RQ-05 — Resolved 2026-10-07: `context/shape-notes.md` D-09 and D-10 keep their original text
  and carry a "Superseded 2026-10-07 by PRD" note with the new decision.
