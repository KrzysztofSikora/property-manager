# Review: create-property-with-weather

Verdict: APPROVE WITH FOLLOW-UPS
Gates: typecheck ok, lint ok, tests 317 passed / 0 failed (`pnpm test`, Docker; 28 files).
Also: `pnpm format:check` ok, `pnpm codegen` leaves no diff.

Base: `bd742be` (parent of `3f63dd6`), head `8ee850d`. No uncommitted changes in tracked files.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `packages/shared/package.json` | done | `zod ^4.6.5` |
| `packages/shared/src/address.ts` | done | `.trim()` before `overwrite` dropped, but `normalizeAddressText` trims; same result |
| `packages/shared/src/address.test.ts` | done | |
| `packages/shared/src/index.ts` | done | |
| `apps/api/package.json` | done | shared workspace dep (Phase 1), `graphql-scalars` (Phase 4) |
| `pnpm-lock.yaml` | done | peer-variant merge logged under *Deviations* |
| `apps/api/test/fixtures/property.ts` | done | `AddressInput` |
| `apps/api/src/domain/{property,weather,ports,errors}.ts` | done | |
| `apps/api/src/domain/weather.test.ts` | done | |
| `apps/api/src/adapters/weatherstack/redact.ts` + test | done | |
| `apps/api/src/adapters/weatherstack/response.ts` + test | done | key-field schema embedded (logged deviation) |
| `apps/api/src/adapters/weatherstack/client.ts` + test | done | |
| `apps/api/test/msw/weatherstack.ts` | done | `status` / `networkError` added (logged deviation) |
| `apps/api/test/fakes/weather.ts` + test | done | |
| `eslint.config.ts` | done | `domain/**` block |
| `apps/api/src/db/schema.ts` | done | `StoredWeather` replaces `WeatherSnapshot`; type only |
| `apps/api/src/repositories/property.repository.ts` | done | `isStateCode` narrowing (logged deviation) |
| `apps/api/src/services/property.service.ts` + test | done | |
| `apps/api/test/fakes/property-repository.ts` | done | |
| `apps/api/test/integration/property-repository.int.test.ts` | done | |
| `apps/api/test/helpers/db.ts` | absent | logged deviation: the type flows through `NewPropertyRow` |
| `apps/api/schema.graphql` | done | |
| `codegen.ts` + `apps/api/src/graphql/generated/resolvers-types.ts` | done | web output unchanged (logged deviation) |
| `apps/api/src/graphql/errors.ts` + test | done | walks `cause`, not `originalError` (logged deviation) |
| `apps/api/src/graphql/resolvers.ts` | done | |
| `apps/api/src/graphql/context.ts` | done | |
| `apps/api/src/app.ts` | done | |
| `apps/api/src/main.ts` | done | |
| `apps/api/src/app.test.ts` | done | |
| `apps/api/test/helpers/app.ts` | done | |
| `apps/api/test/helpers/graphql.ts` | done | |
| `apps/api/test/operations.ts` | done | |
| `apps/api/test/integration/create-property.int.test.ts` | done | |
| `apps/api/test/integration/smoke.int.test.ts` | absent | logged deviation: unchanged, still passes |
| `context/test-plan.md` | done | |
| `context/roadmap.md` | done | S-01 / S-03 scope notes |
| `apps/api/vitest.{unit,int}.config.ts` | unplanned | logged under *Deviations* (single `graphql` instance) |
| `context/changes/create-property-with-weather/{plan,plan-review,mutation}.md`, `context/lessons.md` | unplanned | process artifacts |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | All planned ACs are covered by passing tests; the error chain, masking and normalization behave as specified. |
| Design | ok | Clean resolver → service → port layering, `domain/` enforced by ESLint, composition root takes ports. |
| Safety | concern | No key leak, but the unexpected-error log writes the whole insert (address and weather JSON) (R1). |
| Tests | concern | Several adapter tests still assert only the error class, against the new lesson (R2). Mutation decisions are plausible. |
| Simplicity | ok | Small, focused modules; no dead code found. |
| Plan fidelity | concern | Error and adapter log lines have no request id, unlike `tech-stack.md` (R3); Phase 4 not ticked (R4). |

## Findings

### R1: The unexpected-error log writes the full insert parameters (user address and weather JSON)
- Severity: major
- Where: `apps/api/src/graphql/errors.ts:58`
- Problem: `logger.error({ err: cause })` serializes the root cause as it is. For a database
  rejection that is Drizzle's `DrizzleQueryError`, whose `message` is `Failed query: <sql>
  params: <params>` and which also carries `query` and `params` as fields. A probe (the FR-05
  AC6 "lat out of range" scenario through `createTestApp`) showed the logged `err` has keys
  `type, message, stack, query, params`, includes the street (`Golden Eagle`) and the whole
  Weatherstack `current` (icon URLs), and is about 6.5 KB for one line. This contradicts the
  policy stated in `app.ts:45` ("Variables are never logged: create inputs are user data").
  It also means S-02's `23505` duplicate path will log every rejected address in full. The
  Weatherstack key is not in the params, so this is not an NFR-01 breach.
- Fix: log a summary, not the raw error: `name`, the pg `code` / `constraint` (from the error
  or its `cause`) and a stack, without `query` / `params`. One option is a small
  `summarizeUnexpected(error)` in `graphql/errors.ts`. Another is a pino `err` serializer in
  `logger.ts` that drops `params`, which also covers other call sites. Add an assertion to the
  FR-05 AC6 integration test that the log line does not contain the street.
- Effort: small
- Decision: fix. `graphql/errors.ts` logs a `summarizeError` summary (name, pg `code` / `constraint`, stack frames, down the `cause` chain), never message, `query`, `params` or `detail`. Unit tests over a Drizzle-shaped error; FR-05 AC6 integration tests assert the constraint is logged and the street, the insert and the weather are not.

### R2: Adapter tests still assert only the error class (lesson breach)
- Severity: major
- Where: `apps/api/src/adapters/weatherstack/response.test.ts:29`, `:45`, `:74`;
  `apps/api/src/adapters/weatherstack/client.test.ts:121`
- Problem: `context/lessons.md` ("Assert an error's cause or code, not only its type", scope
  `apps/api/src/adapters/`) asks for `cause` and logged details. These tables check only
  `toThrow(WeatherUnavailableError)` / `toBeInstanceOf`: the TR-03 "missing key field" rows,
  the 10-row "is unavailable" table (`lat not numeric`, `region empty`, `location missing`, ...)
  and the `null` / `'ok'` / `[]` body rows in `response.test.ts`, and the TR-01 table in
  `client.test.ts` (the `success: false` and "missing key field" rows check no cause at all).
  Each row passes if the error comes from a different failing path, which is exactly the
  failure the lesson records. The cause is cheap to assert: `parseWeatherstackResponse`
  already returns `{ issues: ['location.lat'] }` and similar.
- Fix: in `response.test.ts`, use the existing `catchError` and assert
  `error.cause` (`{ issues: [<path>] }` per row; add the expected path as a table column). In
  the `client.test.ts` TR-01 table, add an expected `cause` column
  (`{ status: 500 }`, `{ error: { name: 'TypeError' } }`, `{ weatherstackError: {...} }`,
  `{ issues: ['current.temperature'] }`).
- Effort: small
- Decision: fix. `response.test.ts` asserts `cause: { issues: [<path>] }` per row (path column added); the `client.test.ts` TR-01 table has `cause` and `logged` columns and asserts both.

### R3: Error and Weatherstack log lines carry no request id
- Severity: major
- Where: `apps/api/src/graphql/errors.ts:58`, `apps/api/src/main.ts:28-34`
  (and `apps/api/test/helpers/app.ts`, which wires the same way)
- Problem: `context/tech-stack.md` (Logging, resolves OQ-05) says the per-operation request id
  "is logged with every line". `createMaskError` and `createWeatherstackClient` both get the
  root logger at the composition root, so the `unexpected error` line and every
  `Weatherstack ...` warning have no `requestId` (the probe confirmed no `requestId` on the
  unexpected-error line). Only the `graphql operation` line has it, so a failure cannot be tied
  to its request. Code and artifact disagree, which CLAUDE.md says to raise.
- Fix: option A: log unexpected errors from the existing `operationLogging` plugin's
  `onExecuteDone` with `args.contextValue.logger` (it sees `result.errors` and their `cause`),
  and keep `maskError` for mapping only; pass the context logger to the adapter per call
  (`current(query, { logger })`) or via `AsyncLocalStorage`. Option B: accept that these lines
  have no request id and amend `tech-stack.md`. A is what the decision says; B is cheaper.
- Effort: medium
- Decision: fix (option A). Unexpected errors are logged from the operation plugin's `onExecuteDone` with the context logger; `AppDeps.weather` is `(logger) => WeatherClient`, built per request. Integration tests assert the `unexpected error` line and the Weatherstack warning share the operation's `requestId`. Logged in the plan's Deviations.

### R4: Plan Progress does not tick Phase 4
- Severity: minor
- Where: `context/changes/create-property-with-weather/plan.md:466`
- Problem: Phase 4 is committed (`dd0abe1`) and its deviations are logged, but the Progress
  line is still `- [ ] Phase 4: GraphQL wiring and end-to-end create` with no hash.
- Fix: tick it and append `(dd0abe1)`.
- Effort: small
- Decision: fix. Phase 4 ticked with `(dd0abe1)`.
