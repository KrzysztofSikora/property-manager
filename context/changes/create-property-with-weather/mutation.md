# Mutation check: create-property-with-weather

Targets: `packages/shared/src/address.ts`; `apps/api/src/adapters/weatherstack/{client,response,redact}.ts`,
`apps/api/src/domain/weather.ts`, `apps/api/src/services/property.service.ts`,
`apps/api/src/graphql/errors.ts` (whole files) · Tests: `packages/shared/vitest.config.ts`,
`apps/api/vitest.unit.config.ts` (command runner, `--concurrency 4`)
Score (killed / survived / no coverage / timeout):

| Module | Before | After |
|--------|--------|-------|
| `address.ts` | 71.4% (20 / 8 / 0 / 0) | 71.4% (unchanged, no test changes) |
| `client.ts` | 51.1% (23 / 22 / 0 / 0) | 86.7% (39 / 6 / 0 / 0) |
| `response.ts` | 67.7% (21 / 10 / 0 / 0) | 100% (31 / 0 / 0 / 0) |
| `redact.ts` | 100% (17 / 0 / 0 / 0) | 100% |
| `weather.ts` | 100% (3 / 0 / 0 / 0) | 100% |
| `property.service.ts` | 88.9% (8 / 1 / 0 / 0) | 100% (9 / 0 / 0 / 0) |
| `errors.ts` | 97.9% (45 / 1 / 0 / 1) | 100% (46 / 0 / 0 / 1) |
| api total | 77.6% (117 / 34 / 0 / 1) | 96.1% (145 / 6 / 0 / 1) |

Every target is 100% of its non-equivalent, non-accepted mutants. The one timeout
(`errors.ts:31`, empty `while` body) is a real infinite loop, not load: it stayed a timeout at
concurrency 4.

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `address.ts:14,15,19,20,34` | StringLiteral | field message → `""` | accept | Message wording. The failure, field and code are asserted. |
| `address.ts:27` | ObjectLiteral | `ctx.issues.push({})` | accept | An invalid state is still rejected. Only the issue's code and message change. |
| `address.ts:28,29` | StringLiteral | `code` / `message` → `""` | accept | Same as above: wording and the internal zod issue code. |
| `response.ts:9` (×2) | Regex | `^` or `$` anchor dropped | strengthen | `"N33.6"` / `"33.6N"` would become `NaN` lat/long. Added two rows to the "is unavailable" table. |
| `response.ts:23` | BooleanLiteral | `z.literal(true)` | strengthen | The error body fell through to the shape check and lost its code. The test now asserts `cause = { weatherstackError: { code: 615, type } }`. |
| `response.ts:24,32` (×4) | ObjectLiteral | error schema / cause → `{}` | strengthen | Same test: the code S-02 classifies was not checked. |
| `response.ts:30` (×2) | Conditional / Block | error-body branch skipped | strengthen | Same test. |
| `response.ts:31` | LogicalOperator | `?? {}` → `&& {}` | strengthen | `{ success: false }` without `error` threw a `TypeError` (→ INTERNAL_SERVER_ERROR). Added that row. |
| `client.ts:19-21` (×5) | Block / Conditional / ObjectLiteral | `summarize` drops or empties the redacted error | strengthen | TR-01 fetch-error test passed only because the logged URL has `[REDACTED]`. It now asserts that the cause and the warning carry `TypeError` and the redacted `fetch failed: …` message. |
| `client.ts:20` | Conditional | `instanceof Error` → `true` | strengthen | A non-Error rejection crashed in `redactText`. New test: `fetch` rejects `'offline'` gives a `WeatherUnavailableError` with an `UnknownError` cause. |
| `client.ts:23:10, 23:18` | ObjectLiteral / StringLiteral | non-Error summary emptied | strengthen | Same new test. |
| `client.ts:23:43` | StringLiteral | `'A non-Error value was thrown.'` → `""` | accept | Log wording. |
| `client.ts:33` | StringLiteral | `endsWith('')` | strengthen | A base URL without a trailing `/` dropped its path. The base-URL test now runs `it.each` with and without `/`. |
| `client.ts:45, 52:21, 57:21` | ObjectLiteral | cause / log details → `{}` | strengthen | New test: HTTP 503 gives `cause = { status: 503 }` and one warning with `status`. The fetch-error test covers 52. |
| `client.ts:55` (×2) | Conditional / Block | `!response.ok` check skipped | strengthen | Same HTTP 503 test: the cause would have been a JSON parse error. |
| `client.ts:56` | OptionalChaining | `response.body.cancel()` | strengthen | A bodiless error status threw a `TypeError`. The 503 test uses `new Response(null, …)`. |
| `client.ts:63, 64:21` | Block / ObjectLiteral | invalid-JSON catch emptied | strengthen | The non-JSON test now asserts a `SyntaxError` cause and warning, not just the error type. |
| `client.ts:52:61, 57:50, 64:61, 71:63` | StringLiteral | log message → `""` | accept | Log wording. |
| `client.ts:70` | Conditional | `instanceof WeatherUnavailableError` → `true` | equivalent | `parseWeatherstackResponse` throws only `WeatherUnavailableError`. |
| `errors.ts:16` | StringLiteral | `join('.')` → `join('')` | strengthen | No caller has nested paths yet, but `fields[].field` is part of the `BAD_USER_INPUT` contract (FR-07 AC5). Added "names a nested field by its dotted path". |
| `errors.ts:31` | BlockStatement | empty `while` body | (timeout) | Infinite loop, counted as killed. |
| `property.service.ts:30` | StringLiteral | `units: ''` | strengthen | `InMemoryPropertyRepository` hard-coded `'IMPERIAL'`, so the existing assertion could not fail. The fake now stores the given `units`, as the Drizzle repository does (`property.repository.ts:17`). |

## Dead-weight tests

None found. The TR-01 `it.each` rows (500, 404, network, `success: false`, missing field)
each take a different path through `client.ts`. 404 and 500 overlap, but they are cheap and
document the contract.

## Gaps for the test plan

- No `bug`s found.
- Fakes must behave like the real implementation for each field the service passes in. The
  in-memory repository hid a stored-value mutant (see `property.service.ts:30`).
- `address.ts` baseline 71.4% is below the 90% target. All 8 survivors are message/issue
  wording (accepted). That is 100% of the non-accepted mutants. The local `break` is still `null`
  until a value is agreed.
