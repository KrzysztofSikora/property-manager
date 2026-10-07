# Test plan

Sources: `context/prd.md` (FR-, NFR-, AC IDs), `context/tech-stack.md`, `context/roadmap.md`
(item IDs), `context/shape-notes.md` (R- IDs). Written 2026-10-07, before F-01, so no code
exists yet. File paths and helper names below are the intended layout. F-01 and F-02 create
them, and their plans must update this file if a name changes.

Principles:

- Start from risks. Every test asserts on behaviour seen at a boundary: a GraphQL response,
  a stored row, a returned value, an HTTP request the adapter made, a log line, or what the
  user sees. Coverage is not a target and no coverage threshold is set.
- No real Weatherstack call in any automated test (NFR-02). Service and resolver tests use
  `FakeWeatherClient`. Adapter tests use MSW at the HTTP level. E2E uses a stub server.
- Each Must AC maps to at least one automated test whose name starts with the AC ID, e.g.
  `it('FR-07 AC1: rejects a zip that is not 5 digits', ...)`. That makes success criterion 7
  checkable with `grep`.

## Risk register

Impact and likelihood: H / M / L. Rows are ranked by impact × likelihood, highest first.
Levels: **U** unit (hermetic), **I** integration (Testcontainers PostgreSQL, Yoga in-process,
Weatherstack replaced by a fake or MSW), **E** e2e (Playwright on the Compose stack).
Status: `planned` until the owning roadmap item lands, then `covered` or `gap`.

| ID | Risk | Impact | Likelihood | Level | Test(s) | Status |
|----|------|--------|------------|-------|---------|--------|
| TR-01 | Weatherstack key leaks into a log line, a logged URL, a GraphQL error or a thrown HTTP error (NFR-01, R-05). The key is a query parameter, so any `String(url)` or `error.message` from `fetch` leaks it. | H | M | U + I | U: `redactUrl` / `redactError` helpers on URLs with `access_key` first, middle, last and URL-encoded. I: every FR-06 failure case runs with a sentinel key (`TEST_WEATHERSTACK_KEY`); assert the sentinel is absent from the captured pino output and the serialized GraphQL response, and that any logged URL contains `access_key=[REDACTED]` (FR-06 AC6, AC7). Pre-commit secret scan (see *Quality gates*). | covered (S-01, S-02) |
| TR-02 | Weatherstack error payloads are misclassified: HTTP 200 with `success: false` is treated as success, or code 104 is not mapped to `WEATHER_QUOTA_EXCEEDED` (FR-06 AC1, AC2, R-01). Weatherstack reports errors in a 200 body, which is easy to miss. | H | M | U (MSW) | Adapter tests, one `it.each` table: 104, body 429 → quota; 101, 105, 403 → unavailable + config log entry; 615, unknown code → unavailable; `success: false` without `error` → unavailable. Bodies follow the documented shape (OQ-04, verified in the S-02 plan). | covered (S-02) |
| TR-03 | A response with a changed or partial shape (missing `current`, a missing key field, `lat`/`lon` not numeric) is stored as a broken record, or crashes later on the details page (FR-06 AC5, R-04, NFR-08). | H | M | U | Adapter schema tests: the recorded sample `docs/samples/weatherstack-current.json` parses (contract test). Then each key field removed one at a time (`it.each`) → `WEATHER_UNAVAILABLE`. Non-numeric `lat` → unavailable. Missing `astro` / `air_quality` / non-key fields → success. | planned (S-01 happy path, S-02 failures) |
| TR-04 | A Weatherstack call is made where it must not be: a duplicate, invalid input, a query, a delete, or a retry (C-03, B-N2, FR-01 AC6, FR-04 AC3, FR-07 AC1, FR-08 AC1, FR-09 AC3). Every extra call spends quota (R-01). | H | M | I | `FakeWeatherClient.calls` asserted in every resolver-level integration test: exactly 1 on a successful create, 0 on validation failure, duplicate, `properties`, `property` and `deleteProperty`. Adapter test: exactly one HTTP request on timeout, 5xx and 429 (no retry, FR-06 AC3). | covered for create (S-01, S-02); planned (S-03) |
| TR-05 | A failed create leaves a partial or orphan row: the save runs before the region check, or a DB error happens mid-way (FR-05 AC5, AC6, NFR-08). | H | L | I | For every failure code: property count before = after. The DB rejecting the save (repository fake that throws) → `INTERNAL_SERVER_ERROR` with no row. Schema: `NOT NULL` on every required column, an insert with a null is rejected, and the CHECKs reject out-of-range or malformed values (F-02, `schema.int.test.ts`). | covered (F-02, S-01, S-02) |
| TR-06 | Two concurrent creates of the same address both pass the pre-check and both get stored (FR-08 AC2). This is a race, so it shows up rarely and stays hidden. | M | M | I | Testcontainers: `FakeWeatherClient` holds both calls behind a barrier until both have passed the pre-check, then releases them. `Promise.all` of two `createProperty` calls → exactly one success, one `PROPERTY_ALREADY_EXISTS`, count 1. Repository test: the pg `23505` error on insert maps to the domain duplicate error (Drizzle 0.45 puts the pg error on `DrizzleQueryError.cause`). Storage half: two rows differing only in `street`/`city` case violate `properties_address_unique` (F-02, `schema.int.test.ts`). | covered (F-02, S-02) |
| TR-07 | Address normalization differs between the duplicate check, the unique index and the stored value, so `"15528 e golden eagle  blvd"` is not caught as a duplicate, or a valid address is wrongly blocked (FR-05 AC3, FR-08 AC1, FR-08 AC3). | M | M | U + I | U: `normalizeAddress` table (trim, collapse inner whitespace, state upper-case, case kept for display). I: FR-08 AC1 variant through the API; FR-08 AC3 delete-then-recreate succeeds. | covered (S-01, S-02); FR-08 AC3 through `deleteProperty` planned (S-03) |
| TR-08 | Input validation lets bad data through or rejects valid data: ZIP+4, 4-digit zip, leading-zero zip turned into a number, territories, full state names, blank or overlong street/city (FR-07 AC1 – AC5, A-01 – A-03). | M | M | U + I | U: shared address schema in `packages/shared`, `it.each` with the PRD's exact examples plus boundary lengths (200/201 street, 100/101 city after trimming). I: one resolver test with several invalid fields → one `BAD_USER_INPUT` listing all fields in `extensions.fields`, 0 weather calls. FR-07 AC2 `"02108"` stored and returned as the string `"02108"`. | planned (S-01) |
| TR-09 | The region check gives a false result: case or whitespace in `region`, DC as "District of Columbia" (R-03), or a missing state in the code → name table, so a valid address is rejected or a mismatch is stored (FR-05 AC4). | M | M | U + I | U: `regionMatchesState` table (exact, different case, padded, DC, mismatch). U: the states table has exactly 51 entries and every code maps to a name. I: FR-05 AC4 → `WEATHER_LOCATION_MISMATCH` whose message names "AZ"/"Arizona" and "California", count unchanged. | covered (S-02) |
| TR-10 | The timeout does not fire or a hang blocks the mutation for longer than 6 s (FR-06 AC3, NFR-03). | M | M | U (MSW) | Adapter test with an MSW handler that never resolves (`delay('infinite')`) and an injected short timeout (e.g. 50 ms) → `WEATHER_UNAVAILABLE`, one request. A separate check spies on `AbortSignal.timeout` and asserts the client default of 5000 ms. The real 5 s wait is not run in the suite. | covered (S-02) |
| TR-11 | Network error, non-2xx status or 429 throws an unmapped error, which becomes `INTERNAL_SERVER_ERROR` or leaks the URL (FR-06 AC4). | M | M | U (MSW) | Adapter `it.each`: `HttpResponse.error()`, 500, 503, HTTP status 429 (seen 2026-10-07; a body code 429 is quota, TR-02), 200 with a non-JSON body → `WEATHER_UNAVAILABLE`, key absent from the error. | covered (S-02) |
| TR-12 | Error mapping is wrong: a domain error gets the wrong `extensions.code`, or an unexpected error exposes a stack trace, SQL, a file path or the key (FR-10 AC1, AC2). | M | M | U + I | U: error formatter table, one case per FR-10 code and an unknown `Error` → `INTERNAL_SERVER_ERROR` with a generic message. I: a repository fake throwing an `Error` containing SQL text and a path → the response contains neither. | planned (S-01, S-02) |
| TR-13 | Filtering is wrong: the city `ILIKE` does not escape `%` / `_`, state is not upper-cased, zip uses prefix matching, blank filters filter for `""`, or `totalCount` ignores the filter (FR-03 AC1 – AC6). | M | M | I | Testcontainers: seeded properties, one test per FR-03 AC. Extra: `city: "%"` and `city: "_"` match nothing unless the name contains them. Arg parsing (blank → absent, upper-casing) also has a unit table. | planned (S-03) |
| TR-14 | Sorting or paging is unstable: ties on `created_at` produce duplicates or gaps across pages; `limit`/`offset` bounds not enforced; no `limit` returns a default page instead of all (FR-01 AC3 – AC5, FR-02 AC1 – AC3). | M | M | U + I | U: args schema (`limit` 0/1/100/101, `offset` -1/0, absent `limit`). I: 25 rows inserted with the same `created_at`; pages at offset 0 and 20 together hold all 25 ids once in both directions. No `limit` returns 25. | planned (S-03) |
| TR-15 | Lookups with an unknown or malformed id cause a server error instead of `null` / `PROPERTY_NOT_FOUND` (FR-04 AC2, AC4, FR-09 AC2). Postgres rejects a non-UUID cast with an error. | M | M | I | `property(id: "not-a-uuid")` → `null` with no `errors`. `deleteProperty` with a malformed id and with an unknown UUID → `PROPERTY_NOT_FOUND`. | planned (S-03) |
| TR-16 | Weather mapping is wrong: snake_case → camelCase key fields mismatch `raw`, `lat`/`long` swapped or left as strings, `units` missing (FR-05 AC1, B-7f – B-7h). | M | L | U + I | U: mapper from the parsed sample to the domain `WeatherData`; each key field equals its source value, `raw` deep-equals the response's `current`. I: FR-05 AC1, create then `property(id)` returns the same data. | planned (S-01) |
| TR-17 | The adapter sends the wrong request: the query is not the full normalized address, `units` is not `f`, or the base URL is not read from config (FR-05 AC2, D-03, A-11). | M | L | U (MSW) | MSW handler records the request. Assert path `/current`, `query` = `"15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States"`, `units=f`, the host from `WEATHERSTACK_BASE_URL`, and `access_key` present (compared to the sentinel, never printed). | planned (S-01) |
| TR-18 | Env config: the API starts without a key and fails at the first create, or the error message prints the value (FR-14 AC3). | M | L | U | Config schema test: missing `WEATHERSTACK_KEY` → error names the variable. With an invalid value elsewhere, the message does not contain the sentinel key. `main.ts` started without the key (unset or `''`) exits 1 naming the variable (`apps/api/src/config/env.test.ts`, `apps/api/src/main.test.ts`). | covered (F-01) |
| TR-19 | UI shows the wrong thing for an API error: a generic message instead of the per-code one, entered values lost, or `BAD_USER_INPUT` not attached to fields (FR-13 AC3, AC4, NFR-09). | M | M | U (web) | Testing Library + MSW GraphQL: `it.each` over the four FR-10 create codes → the specific message, inputs keep their values. `BAD_USER_INPUT` with `fields: ['zipCode','state']` → messages next to those inputs. Mapper unit table: every code in the shared error-code list has a message (fails when a code is added without one). | planned (S-05) |
| TR-20 | UI states are missing or wrong: no loading / empty / error-with-retry, the delete dialog deletes on cancel, the list is not refreshed after delete, unknown id crashes the details page, missing optional weather fields crash it (FR-11 AC5, AC6, FR-12 AC3 – AC5). | M | M | U (web) | Testing Library + MSW per AC: delayed handler → loading; empty list → empty state with create link; network error → error state, retry re-requests. Delete: cancel sends no mutation, confirm sends it and the row disappears. Details: `null` → not-found; a snapshot without `astro` / `air_quality` renders. jsdom `<dialog>` support checked in S-04. | planned (S-04) |
| TR-21 | Client-side validation differs from the server's (FR-13 AC1). The shared schema prevents drift, but the form may not use it. | L | M | U (web) | Form test: an empty field, a 4-digit zip and `"XX"` show field messages and MSW records no request. Rule logic is tested once, in `packages/shared`. | planned (S-05) |
| TR-22 | Layering or type rules erode (resolver imports a repository, `any`, enum, `.js` import), which hurts the assessment (NFR-04, NFR-06). | M | M | static | ESLint + `tsc` in pre-commit and CI. Deliberate violations must fail: `tooling/guardrails.test.ts` (`tooling` project) lints virtual files with the real ESLint config and runs `tsc` on `tooling/fixtures/`. | covered (F-01) |
| TR-23 | Generated GraphQL types drift from `schema.graphql`, so resolvers or the web compile against a stale contract. | M | L | static | CI runs `pnpm codegen`, then `git diff --exit-code` and an empty `git status --porcelain` on the generated directories (so new untracked output also fails). Then `tsc`. | covered (F-01) |
| TR-24 | The core journey fails in a real browser on the real stack: routing, the SPA fallback, API URL config, CORS, migrations at start-up (FR-14 AC1, success criteria 1 – 3). Unit tests can't see wiring faults. | H | L | E | One Playwright smoke: create (stub Weatherstack) → lands on details with weather + coordinates → list shows it newest first → filter by city → delete with confirm → gone. Plus one error journey: the stub returns 104 → the form shows the quota message. | planned (S-06) |
| TR-25 | A test calls the real Weatherstack (NFR-02), spending quota and making the suite flaky. | M | L | config | API Vitest setup starts MSW with `onUnhandledFrame: 'error'` (MSW 3's name), so any unmocked outbound request fails the test. CI holds no real key, only the sentinel. E2E points `WEATHERSTACK_BASE_URL` at the stub. Proven by `apps/api/src/net-guard.test.ts` and a case in `apps/api/test/integration/smoke.int.test.ts`. | covered (F-01) |

## Not tested (and why)

- **Real Weatherstack in automated tests.** Forbidden (NFR-02). It is checked manually,
  once per adapter change, and the result is recorded in that change's plan (as was done on
  2026-10-07). Code 104 (quota) is never triggered for real. Its body comes from the
  Weatherstack docs (OQ-04, RQ-04).
- **The real 5 s timeout.** The adapter is tested with a short injected timeout, plus a check
  that config defaults to 5000 ms. Waiting 5 s per run buys nothing.
- **Weatherstack geocoding accuracy (R-03).** It is outside our control (NG-04). We test that
  a mismatch is reported clearly, not that Weatherstack resolves addresses correctly.
- **GraphQL Yoga, Drizzle, `pg`, TanStack Query and React Router themselves.** We test our use
  of them through behaviour (e.g. FR-10 AC2 through the response), not the libraries.
- **Generated code and SDL wiring.** Covered by `tsc` and the codegen drift check (TR-23).
- **Visual styling, layout and browser matrix.** NG-11 targets current desktop browsers. E2E
  runs Chromium only. Testing Library queries by role and label, which catches missing labels
  but is not an accessibility audit.
- **Performance and load.** The app runs locally for one user (NG-07). The only time limit
  (NFR-03) is covered by TR-10.
- **Migration rollback.** drizzle-kit migrations only go forward. Tests run the migrations on an
  empty database.
- **README and AI deliverables (FR-14 AC2, FR-15).** These are documents. They are checked
  against a checklist in the S-06 review, not by automated tests.
- **One-command start on the operator's machine (FR-14 AC1).** CI's e2e job starts the Compose
  stack, which covers most of it. The clean-clone walk-through is a human check in S-06.
- **Should and Could items (#9 – #13).** Tested when they are planned, not before.
- **Mutation testing of the UI error mapping.** S-05 has no `/mutation` step (#7).
  `apps/web/src/lib/graphql-errors.ts` is guarded by TR-19's unit table instead: every code in
  the shared error-code list must have its own message, so a missing branch fails the test.
- **Exact wording of messages.** Tests assert the code and the key facts the PRD requires
  (field names, both states, "upgrade the plan or replace the API key"), not full sentences.

## Quality gates

| Gate | Runs | Must pass |
|------|------|-----------|
| Editor hook (Claude Code `PostToolUse` on `Edit`/`Write`, `.claude/settings.json`) | Prettier `--write` and ESLint on the edited file only. Output goes back to the agent. | Advisory. Problems are fixed in the same step; nothing is blocked here. |
| Pre-commit (`.githooks/pre-commit`, enabled by a `prepare` script that sets `core.hooksPath`; no extra dependency) | Prettier `--check` and ESLint on staged files (refused if a staged file also has unstaged changes, since both read the working tree); `pnpm typecheck`; `pnpm test:unit` (hermetic only, no Docker); secret scan of the staged diff (`tooling/secret-scan-cli.ts`): fails if an added line contains the `WEATHERSTACK_KEY` value from `.env`, or a key-like `access_key=[A-Za-z0-9]{16,}` (so `[REDACTED]`, the sentinel and short placeholders pass). It prints only `file:line kind`, never the matched value. | All green to commit. `--no-verify` is not used (implement skill). |
| CI (GitHub Actions `.github/workflows/ci.yml`, on pull requests and pushes to `main`) | `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm format:check`; codegen then `git diff --exit-code` plus an empty `git status --porcelain` on the generated directories; `pnpm test` (unit + integration, Testcontainers on `ubuntu-latest`); from S-06, `pnpm e2e` against the Compose stack with the stub Weatherstack. `WEATHERSTACK_KEY` is set to the sentinel; no real key is stored in CI. | All jobs green to merge to `main`. |
| Per change, local (`/mutation <id>`) | Stryker on the mutation targets that the change touches. | Every surviving mutant has a recorded decision in `context/changes/<id>/mutation.md`. After the baseline, the local `break` threshold applies (see below). |
| Per change (`/review <id>`) | Plan-vs-diff review. Checks the AC-to-test mapping and that every risk row the item owns is `covered`. | No open `blocker`/`major` finding. A target survivor with no decision is at least `major`. |

Stryker does not run in CI (roadmap decision). It is slow, needs judgement on each survivor,
and runs per change instead.

## Mutation targets

Only hermetic unit tests run under Stryker (`apps/api/vitest.unit.config.ts`, which excludes
`*.int.test.ts`; `packages/shared/vitest.config.ts`; `apps/web/vitest.config.ts`;
`tooling/vitest.config.ts` without `guardrails.test.ts`).
Stryker uses the `command` runner, not `@stryker-mutator/vitest-runner`, which on Vitest 5
runs zero tests per runtime mutant (stryker-js#6210). Each mutant reruns the package's
hermetic suite, and there is no `NoCoverage` status. Switch back once #6210 is released
(`context/changes/repo-skeleton/mutation.md`).
Code guarded only by Testcontainers tests (the repository's SQL) is not a target. A mutant run
per container start is too slow, and the integration tests in TR-06, TR-13 and TR-14 guard it.

| Module | Why | Target score | CI (report / break at N%) |
|--------|-----|--------------|---------------------------|
| `packages/shared/src/address.ts` (address zod schema, `normalizeAddress`) and `packages/shared/src/states.ts` lookup | Validation and normalization decide what gets stored, what counts as a duplicate, and what the form accepts. A flipped length bound or regex anchor passes a "runs the code" test (TR-07, TR-08). | 90% | Not in CI. Local `break` at 85% after the baseline. |
| `apps/api/src/adapters/weatherstack/` response schema and error classification, and `apps/api/src/domain/weather.ts` (key-field schema, `toCurrentWeather` mapper) | Third-party payload mapping: a 200 error body, a missing key field and snake_case mapping are exactly where a silent bug stores bad data or burns quota (TR-02, TR-03, TR-11, TR-16). | 85% | Not in CI. Local `break` at 80% after the baseline. |
| `apps/api/src/adapters/weatherstack/redact.ts` (URL / error redaction) | One wrong regex leaks the key (TR-01). Small module, so every mutant should die. | 100% (equivalents excepted) | Not in CI. Local `break` at 100% of non-equivalent mutants. |
| `apps/api/src/services/property.service.ts` create flow and `regionMatchesState` | The order validate → duplicate → weather → region → save, and the region comparison, are business rules where a swapped step costs quota or stores bad records (TR-04, TR-05, TR-09). Tested with `FakeWeatherClient` and an in-memory repository fake. | 80% | Not in CI. Local `break` at 75% after the baseline. |
| `apps/api/src/graphql/errors.ts` (domain error → `extensions.code`, masking) and the `properties` args schema | Error mapping and query argument rules (bounds, blank filters, upper-casing) are tables; a mutant in a table entry is a wrong code or a wrong bound (TR-12, TR-14). | 90% | Not in CI. Local `break` at 85% after the baseline. |
| `apps/api/src/config/env.ts` (env schema, missing vs invalid messages) | A bad bound or anchor starts the API on a wrong port or URL; a wrong message hides which variable is wrong or echoes a secret (TR-18). | 85% | Not in CI. Baseline 83.0% (F-01), 84.6% after F-02's `loadDatabaseConfig`; all 8 survivors equivalent or accepted. |
| `apps/api/src/db/migrate-cli.ts` (DB URL / password redaction in `pnpm db:migrate` output) | One wrong check prints the database password or garbles the failure reason (F-02). | 100% of non-equivalent, accepted survivors excepted | Not in CI. Baseline 76.3% (F-02); of the 9 survivors 3 are equivalent and 6 accepted (entry-point block, `decodedOrSelf` catch), see `changes/property-schema/mutation.md`. |
| `tooling/secret-scan.ts` (pre-commit key-leak scan) | One wrong hunk regex or line count lets the key into a commit or blocks clean commits (TR-01). | 100% (equivalents excepted) | Not in CI. Baseline 93.6% (F-01) = 100% of non-equivalent. |
| `apps/web/src/lib/execute.ts` (GraphQL/HTTP response → `GraphQLRequestError`) | A weakened check shows an error or empty payload as success in every page (FR-12, FR-13). | 90% | Not in CI. Baseline 97.4% (F-01). |

Target scores are starting points. The first `/mutation` run on each module records the
baseline in its `mutation.md`. Until then `break` is `null`. Raising `break` above the
recorded baseline needs the user's approval (mutation skill).

## Test data and isolation

- **Fixtures from one source.** `docs/samples/weatherstack-current.json` is the only recorded
  response. The builder `weatherstackResponse(overrides)` in
  `apps/api/test/fixtures/weatherstack.ts` derives every variant from it (other region,
  missing field, error bodies). Overrides deep-merge (arrays and scalars replace), and an
  `undefined` value removes the key. Error bodies are built by
  `weatherstackError(code, type, info?)`.
- **The canonical valid input** is the PRD's: `15528 E Golden Eagle Blvd, Fountain Hills, AZ
  85268`, with region `Arizona` (`validInput()` in `apps/api/test/fixtures/property.ts`).
  Other addresses are derived through overrides, so tests read as "valid input except X".
- **Sentinel key.** Tests set `WEATHERSTACK_KEY` to the constant `TEST_WEATHERSTACK_KEY`
  (a recognisable fake, not a real key), exported from `apps/api/test/helpers/secrets.ts`.
  Leak assertions (`expectNoSecret`) search for that string. The real key
  is never loaded in tests: Vitest does not read `.env`.
- **Database.** Testcontainers starts one `postgres:18-alpine` container per test run (Vitest
  `globalSetup`), runs the drizzle-kit migrations once, and passes the connection URL through
  `provide`/`inject`. Each integration test file truncates `properties` in `beforeEach`. Test
  files that use the database run serially (`fileParallelism: false` in the integration
  project), so truncation cannot race. Rows are seeded with `seedProperty`
  (`apps/api/test/helpers/db.ts`), which inserts through the Drizzle table, not the
  repository, so seeding does not depend on the code under test. Pass `createdAt` explicitly
  when order matters.
- **Time.** Ordering tests set `createdAt` explicitly instead of sleeping. Tie-break tests give
  many rows the same `createdAt`.
- **Network.** MSW `setupServer` with `onUnhandledFrame: 'error'` (MSW 3's name) in the API and web Vitest
  setup. `server.resetHandlers()` after each test. Testcontainers talks to Docker over a
  socket, which MSW does not intercept.
- **Logs.** `captureLogs()` (`apps/api/test/helpers/logs.ts`) gives a pino logger at level
  `trace` writing to an in-memory stream, and `lines()` returns the parsed lines, so tests
  assert on log content without touching stdout.
- **Web.** `renderWithProviders` creates a fresh `QueryClient` per test with `retry: false`, so
  cached data and retries never cross tests.
- **E2E.** The Compose stack starts with a fresh database volume. Each spec creates the data it
  needs through the UI, with a unique street per run, so specs don't depend on each other.

## Cookbook

Naming: unit tests sit next to the code as `*.test.ts(x)`. Integration tests are
`*.int.test.ts` under `apps/api/test/integration/`. E2E specs are `e2e/*.spec.ts`. Test names
start with the AC or risk ID they cover. Every test has at least one assertion on observable
behaviour. Commands are listed in CLAUDE.md.

Vitest projects (root `vitest.config.ts`): `shared` (`packages/shared/vitest.config.ts`),
`api-unit` (`apps/api/vitest.unit.config.ts`, hermetic), `api-int`
(`apps/api/vitest.int.config.ts`, Testcontainers `globalSetup` in
`apps/api/test/setup/postgres.ts`), `web` (`apps/web/vitest.config.ts`, jsdom) and `tooling`
(`tooling/*.test.ts`). `pnpm test:unit` runs all but `api-int`; `pnpm test` runs all. The API
MSW setup is `apps/api/test/setup/msw.ts`, the web one `apps/web/src/test/setup.ts`.
`api-unit` also runs the hermetic helper tests in `apps/api/test/**/*.test.ts`.

### Add a unit test

For pure logic: validation, normalization, mapping, error classification, UI components.

1. Find the module and its risk row above. If no row fits, add one first.
2. Create or open the sibling file, e.g. `packages/shared/src/address.test.ts`.
3. Build inputs from fixtures (`validInput()`, `weatherstackResponse({...})`). Don't hand-write
   a full payload.
4. Use `it.each` for tables of inputs (zip formats, error codes, region spellings) instead of
   copying a test.
5. Assert the result the caller sees: the returned value, the parsed object, the thrown domain
   error's `code`. Do not assert on private helpers or call order inside the unit.
6. Adapter tests: start from the `weatherstackHandlers` in `apps/api/test/msw/weatherstack.ts`
   (`ok`, `status`, `networkError`, `hang`, `text`; each records its requests). Override per test
   with `server.use(http.get('*/current', () => HttpResponse.json(...)))` (imports from
   `msw/http` in MSW 3). To check the
   request, read it inside the handler and assert on `url.searchParams` (compare `access_key`
   to the sentinel, never print it).
7. Web component tests: `renderWithProviders(<Page />, { route: '/properties/new' })` from
   `apps/web/src/test/render.tsx`. GraphQL handlers come from `apps/web/src/test/msw.ts`
   (`api = graphql.link('/graphql')` from `msw/graphql`, so tests write
   `api.query('Properties', ...)`, `api.mutation('CreateProperty', ...)`). Query by
   role or label, act with `userEvent`, assert what is on screen and which requests MSW
   recorded.
8. Run `pnpm test:unit`. Make the test fail once (break the code or the expectation) to see that
   it can fail, then restore.

### Add an integration test

For a GraphQL operation through resolver → service → repository → PostgreSQL, with Weatherstack
replaced.

1. Create `apps/api/test/integration/<feature>.int.test.ts`.
2. Call `const app = createTestApp()` from `apps/api/test/helpers/app.ts`, and
   `afterAll(app.close)`. It wires the real composition root with the test database from
   `inject('databaseUrl')`, the sentinel key and a captured logger, and returns
   `{ db, weather, execute, logs, close }`. `weather` defaults to a `FakeWeatherClient`
   (`apps/api/test/fakes/weather.ts`) serving the recorded sample; pass your own with
   `createTestApp({ weather: new FakeWeatherClient(weatherstackResponse({...})) })`.
   `repository` replaces the Drizzle repository, e.g. an `InMemoryPropertyRepository`
   (`apps/api/test/fakes/property-repository.ts`) with `failInsert(error)`.
3. In `beforeEach`, call `await resetDb(app.db)`. Seed with `seedProperty(app.db, {...})` when
   the test needs existing rows; it returns the inserted row.
4. Execute operations with `await app.execute(document, variables)`. It sends the request
   through `yoga.fetch` and returns `{ data, errors }`. Use the documents from
   `apps/api/test/operations.ts`.
5. Assert, in this order:
   - the GraphQL result (`data`, or `errors[0].extensions.code` with `expectGraphQLError(result,
     'PROPERTY_ALREADY_EXISTS')` from `apps/api/test/helpers/graphql.ts`, which also returns the
     error for checks on `message` and `extensions.fields`);
   - the database state (`countProperties(app.db)` or a read through the repository);
   - weather calls (`expect(app.weather.calls).toHaveLength(n)`);
   - for failure cases, no leak: `expectNoSecret(result, app.logs())` from
     `apps/api/test/helpers/secrets.ts`.
6. For adapter failures end to end, use `createTestApp({ weather: 'msw' })`, which
   wires the real `WeatherClient` against the MSW handlers instead of the fake.
7. For races (FR-08 AC2), use `FakeWeatherClient.withBarrier(2)`, which holds calls
   until two have arrived, then fire both operations with `Promise.all`.
8. Run `pnpm test` (Docker must be running).

### Add an e2e test

Only for a journey that crosses the browser, the SPA routing, the API and the database. Keep
the suite to a handful of specs. Everything else belongs in a unit or integration test.

1. Create `e2e/<journey>.spec.ts`. Playwright config is in `e2e/playwright.config.ts`, and the
   `webServer` / global setup brings up the Compose stack with
   `WEATHERSTACK_BASE_URL` pointed at the stub service (location decided in S-06).
2. The stub serves `docs/samples/weatherstack-current.json` by default. To force an error, use
   a street that contains a stub trigger (e.g. `"... QUOTA"` → error 104). The trigger list is
   documented in the stub's README.
3. Use a unique street per run (`uniqueStreet()` helper) so specs don't collide.
4. Use role-based locators (`getByRole('button', { name: 'Create' })`) and web-first assertions
   (`await expect(...).toBeVisible()`). No fixed sleeps.
5. Run `pnpm e2e`. In CI it runs as its own job after `test`.

### Run a mutation check

Run after a change touches a module in *Mutation targets*. Use `/mutation <change-id>`, which
records decisions in `context/changes/<id>/mutation.md`.

1. Make sure the change's hermetic tests pass: `pnpm --filter <package> test:unit`.
2. Run Stryker on the touched target files only:
   `pnpm --filter <package> test:mutation --mutate "src/adapters/weatherstack/classify.ts"`
   (several files: one comma-separated `--mutate "a.ts,b.ts"`; a second `--mutate` flag
   replaces the first. In `apps/api` add `--concurrency 4`: the default runner count makes
   mutants time out under load, and Stryker counts timeouts as killed.)
   (tooling: `pnpm test:mutation:tooling --mutate tooling/secret-scan.ts`).
   Narrow with a line range (`file.ts:10-80`) for large files.
3. Read the report in `reports/mutation/` (HTML for browsing, JSON for triage).
4. For every surviving or uncovered mutant, record one decision: `strengthen`, `equivalent`,
   `accept` or `bug`. Strengthen only by adding or sharpening assertions on boundary behaviour.
   Never change production code to kill a mutant.
5. Re-run the same scope and record the score before and after.
6. If "no tests ran" for a file, that file lacks hermetic tests. Add a row to *Gaps for the
   test plan* in `mutation.md` and update this file's risk register.
7. On a module's first run, record its baseline. If the baseline is below the target, note
   why, and set the local `break` only after the user agrees on a value.
