# Mutation check: property-schema

Targets: `packages/shared/src/states.ts:58-64` (`isStateCode`, `stateName`),
`apps/api/src/config/env.ts` (whole; refactored into `parseEnv` + `loadDatabaseConfig`),
`apps/api/src/db/migrate-cli.ts` (whole; DB URL / password redaction on stderr).
Skipped: `errors.ts` (constant list), the `US_STATES` table (constants, guarded by the TR-09
shape tests), `schema.ts` and the migration SQL (config, guarded by `schema.int.test.ts`),
`migrate.ts` and `client.ts` (wiring), test helpers and fixtures.

Tests: `packages/shared/vitest.config.ts`, `apps/api/vitest.unit.config.ts`. Command runner,
`--concurrency 4`.

Score: 75.8% -> 81.3% (91 mutants: 69 / 22 / 0 / 0 -> 74 / 17 / 0 / 0, killed / survived /
no coverage / timeout)

| File | Before | After | Killed / survived after |
|------|--------|-------|-------------------------|
| `states.ts:58-64` | 100% | 100% | 1 / 0 |
| `env.ts` | 84.6% | 84.6% | 44 / 8 |
| `migrate-cli.ts` | 63.2% | 76.3% | 29 / 9 |

Every survivor in the second run is `equivalent` or `accept` below. No `bug`.

**Concurrency.** The first api run used Stryker's default (15 runners). It reported 27 of
38 `migrate-cli.ts` mutants as Timeout, which counts them as caught. They were load
artefacts: at `--concurrency 4` none timed out, and 14 survived. Use `--concurrency 4` for
the api package. A score made of timeouts is not a score.

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| env.ts:51 | StringLiteral | `ConfigError.name` → `""` | accept | As in F-01: callers use `instanceof` and print only `message`. |
| env.ts:55 | LogicalOperator, ConditionalExpression ×2 | `isEnvName` weakened | equivalent | As in F-01: it only sees `REASONS` keys or `issue.path[0]` of an object schema built from them. Still true for `databaseEnvSchema`. |
| env.ts:66 | LogicalOperator, ConditionalExpression ×2 | `isEnvName(name) && value !== undefined` weakened | equivalent | As in F-01: `name` is always an env name; storing `undefined` equals leaving it unset. |
| env.ts:71 | MethodExpression | `.filter(isEnvName)` dropped | equivalent | As in F-01. |
| migrate-cli.ts:16 | ConditionalExpression, StringLiteral | `password !== ''` → `true` | strengthen | With no password, `replaceAll('', …)` put `[REDACTED]` between every character of the message. Added the "no password" row to the redaction table. |
| migrate-cli.ts:21 | ConditionalExpression | non-Error branch → `false` | strengthen | A rejected string printed `Migration failed: undefined`. Added the "non-Error rejection" case. |
| migrate-cli.ts:23 | ConditionalExpression, StringLiteral | empty-message check → `false` | strengthen | The empty-message AggregateError that a refused `localhost` connection produces printed `Migration failed: ` with no reason. Added the AggregateError case. |
| migrate-cli.ts:7 | BlockStatement | `catch { return value; }` → `catch {}` | accept | With a malformed escape, `undefined` joins the secrets list and the raw password is still redacted. The only visible change is that the literal word "undefined" in a message gets redacted. The new malformed-encoding row covers the no-crash path; the mutant itself would need a contrived message. |
| migrate-cli.ts:15 | OptionalChaining | `URL.parse(url)?.` → `.` | equivalent | `loadDatabaseConfig` has already checked the URL with `z.url()`, so `URL.parse` never returns `null` here. |
| migrate-cli.ts:15 | StringLiteral | `?? ''` → `?? "Stryker was here!"` | equivalent | `URL#password` is always a string, so the fallback never runs. |
| migrate-cli.ts:34 | ConditionalExpression | `error instanceof ConfigError` → `true` | equivalent | `loadDatabaseConfig` throws nothing but `ConfigError`. Proving the rethrow would mean mocking `env.ts` to throw something it cannot throw. |
| migrate-cli.ts:50-52 | ConditionalExpression ×2, BlockStatement ×2, CallExpression | `import.meta.main` entry block | accept | Process wiring (exit code, `console.error`). A unit test would have to spawn the CLI against a database. `runMigrateCli` holds the logic and is fully tested; the entry point gets exercised by `pnpm db:migrate` and S-06. |

Tests changed in `apps/api/src/db/migrate-cli.test.ts`: the two redaction tests became one
`it.each` table with two new rows (malformed percent-encoding, no password), and a new
`it.each` covers the reason text for a non-Error rejection and an empty-message AggregateError.
Net: 2 tests folded into 1 table, 4 cases added (5 → 9 tests).

## Dead-weight tests

- `states.test.ts`: the two `stateName` tests (`DC`, `AZ`) both kill the single lookup mutant.
  They could be folded into one `it.each`, but they are cheap and DC is the non-state edge
  case. No change.
- `migrate-cli.test.ts`: the two redaction tests were near copies. They are now folded into
  the parametrised table above.

## Gaps for the test plan

- `apps/api/src/db/migrate-cli.ts` (password redaction) is not in *Mutation targets*. Added
  it there: baseline 76.3%, all 9 survivors equivalent or accepted.
- The `apps/api` Stryker run needs `--concurrency 4`, or timeouts inflate the score. Noted in
  the test plan.
