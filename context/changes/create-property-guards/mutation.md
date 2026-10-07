# Mutation check: create-property-guards

Targets: `apps/api/src/adapters/weatherstack/{response,client}.ts`,
`apps/api/src/services/property.service.ts` (whole files, Phase 3 uncommitted in the working
tree) · Tests: `apps/api/vitest.unit.config.ts` (command runner, `--concurrency 4`)
Score (killed / survived / no coverage / timeout):

| Module | Before | After |
|--------|--------|-------|
| `client.ts` | 93.0% (52 / 4 / 0 / 1) | 93.0% (unchanged, no test changes) |
| `response.ts` | 100% (43 / 0 / 0 / 0) | 100% |
| `property.service.ts` | 100% (24 / 0 / 0 / 0) | 100% |
| total | 96.8% (119 / 4 / 0 / 1) | 96.8% |

Not mutated: `domain/errors.ts` (new classes are code and message constants; `maskError` in
`graphql/errors.ts` is unchanged), `repositories/property.repository.ts` (`existsByAddress` and
the `23505` mapping are SQL / pg behaviour guarded only by Testcontainers tests, which the
test plan excludes from Stryker), and test helpers (`test/msw`, `test/fakes`).

The one timeout (`client.ts:53`, `{ signal: AbortSignal.timeout(timeoutMs) }` → `{}`) is a real
hang, not load: the TR-10 `hang()` test never finishes without the signal. At concurrency 4 it
is the only timeout.

Every target is at 100% of its non-equivalent, non-accepted mutants. All four survivors repeat
mutants that S-01 already decided (`changes/create-property-with-weather/mutation.md`).

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `client.ts:25:43` | StringLiteral | `'A non-Error value was thrown.'` → `""` | accept | Log wording. The `UnknownError` name and the error class are asserted (S-01 decision). |
| `client.ts:60:50` | StringLiteral | `'Weatherstack returned an error status'` → `""` | accept | Log wording. The level, `status` and redacted URL are asserted. |
| `client.ts:67:61` | StringLiteral | `'Weatherstack returned invalid JSON'` → `""` | accept | Log wording. The `SyntaxError` cause and warning are asserted. |
| `client.ts:79:20` | ConditionalExpression | `else if (error instanceof WeatherUnavailableError)` → `else if (true)` | equivalent | `parseWeatherstackResponse` throws only `WeatherQuotaExceededError` (handled on line 75) or `WeatherUnavailableError`. Its `safeParse` calls do not throw, and `Number` in the transform does not either. |

## Dead-weight tests

- `property.service.test.ts:143` "accepts a region that differs only in case and spacing":
  kills nothing that the TR-09 `regionMatchesState` table (`" Arizona "`, `"ARIZONA"`) and the
  happy-path create tests do not already kill. It could be dropped. The service wiring is
  covered by the mismatch test (line 127) and the stored-row tests.
- `property.service.test.ts:180` "an address with a different %s is stored" (`it.each`, 3 rows):
  the service only calls `repository.existsByAddress`, so these rows check the
  `InMemoryPropertyRepository` key rule, not production code. The real rule is covered against
  PostgreSQL in `property-repository.int.test.ts:162`. Keep it only if it is meant to stop the
  fake drifting from `properties_address_unique`. If so, say that in the test name.

## Gaps for the test plan

None. Every target had hermetic tests and every mutant ran tests.
