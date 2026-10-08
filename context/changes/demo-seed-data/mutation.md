# Mutation check: demo-seed-data

Targets: `apps/api/src/seed/seed.ts` (whole), `apps/api/src/config/env.ts` (whole; adds
`SEED_API_URL` and `loadSeedConfig`) · Tests: `apps/api/vitest.unit.config.ts` (command runner,
`--concurrency 4`, 0 timeouts)
Score: `seed.ts` baseline 96.1% (74 / 3 / 0 / 0), 100% of non-equivalent mutants.
`env.ts` 86.0% (49 / 8 / 0 / 0), up from 84.6% at F-02 because every new mutant
(the `SEED_API_URL` reason, the `z.url()` check, the default URL, the `apiUrl` mapping) is killed.
Same 8 survivors as F-01 / F-02. No test was added, so the score after triage is unchanged.

Not mutated: `seed-cli.ts` (CLI wiring; the plan accepts the entry point, `setTimeout` sleep and
default wiring as untested, and it is not in *Mutation targets*), `addresses.ts` (constants,
checked by `addresses.test.ts` against the shared schema).

## Mutants
| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| seed.ts:63 | BlockStatement | `catch { return undefined; }` → `catch {}` | equivalent | The function returns `undefined` either way. |
| seed.ts:79 | ObjectLiteral | `{ kind: 'created' }` → `{}` | equivalent | `runSeed` checks only `'failed'` and `'exists'`; any other outcome takes the "created" path, so output, spacing and exit code are the same. |
| seed.ts:79 | StringLiteral | `kind: 'created'` → `kind: ""` | equivalent | Same reason as above. |
| env.ts:59 | StringLiteral | `ConfigError.name` → `""` | accept | As in F-01 / F-02: callers (`main.ts`, `migrate-cli.ts`, now `seed-cli.ts`) use `instanceof` and print only `message`. |
| env.ts:63 | LogicalOperator, ConditionalExpression ×2 | `isEnvName` weakened to `\|\|` / `true` | equivalent | As in F-01 / F-02: it sees only `REASONS` keys or `issue.path[0]` of an object schema built from them. Still true for `seedEnvSchema`. |
| env.ts:74 | LogicalOperator, ConditionalExpression ×2 | `isEnvName(name) && value !== undefined` weakened | equivalent | As in F-01 / F-02: `name` is always an env name, and storing `undefined` equals leaving it unset. For `SEED_API_URL` the zod `.default` also applies to an explicit `undefined`. |
| env.ts:79 | MethodExpression | `.filter(isEnvName)` dropped | equivalent | As in F-01 / F-02: every issue path starts with an env name. |

Earlier `strengthen` rows on `env.ts` (lessons.md, "moves a rule's input"): the `PORT` regex rows
(`+80`, `8e3`) and the one-line-per-variable `join('\n')` row. This change moves neither input
(`PORT` is still read by `loadConfig`, and several bad variables still go through `parseEnv`).
Both mutants are killed in this run.

## Dead-weight tests
- `seed.test.ts` "stops at %s, naming the address and the code" runs once per `ERROR_CODES`
  entry except the duplicate. All cases take the same branch, so one case kills what the others
  kill. Kept: it is the plan's contract table, and it fails if someone later special-cases one
  code (e.g. a retry on `WEATHER_UNAVAILABLE`) without deciding on purpose. It is already one
  `it.each`, so there is nothing to fold.
- No other overlap found: each row of the "stops at %s with its own reason" table reaches a
  different path (`bodyOf` catch, schema success without errors or data, schema failure,
  `fetch` rejection) and asserts its own reason.

## Gaps for the test plan
- None. `seed.ts` reaches its 90% target on its first run. *Mutation targets* now records the
  baseline (96.1%) and `env.ts` at 86.0%.
