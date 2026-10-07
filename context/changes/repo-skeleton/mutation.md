# Mutation check: repo-skeleton

Targets: `apps/api/src/config/env.ts` (env validation, secret-safe messages),
`tooling/secret-scan.ts` (pre-commit key-leak scanner), `apps/web/src/lib/execute.ts`
(GraphQL/HTTP response → error mapping). Whole files.
Skipped as wiring or presentation: `app.ts`, `main.ts`, `logger.ts`, `graphql/*`, web pages,
`Layout`, `routes`, `ApiStatus`, generated code.

Tests: `apps/api/vitest.unit.config.ts`, `apps/web/vitest.config.ts`,
`tooling/vitest.config.ts` (without `guardrails.test.ts`). Command runner, no coverage
analysis (see *Runner* below).

Score: 73.2% -> 91.5% (164 mutants: 120 / 44 / 0 / 0 -> 150 / 14 / 0 / 0, killed / survived /
no coverage / timeout)

| File | Before | After | Killed / survived after |
|------|--------|-------|-------------------------|
| `env.ts` | 76.6% | 83.0% | 39 / 8 |
| `execute.ts` | 64.1% | 97.4% | 38 / 1 |
| `secret-scan.ts` | 75.6% | 93.6% | 73 / 5 |

Every mutant that survived the second run is `equivalent` or `accept` below.

## Runner

The first run with `@stryker-mutator/vitest-runner` 10.0.0 (the latest) gave `env.ts`
21.3%. That number is wrong. On Vitest 5 the runner builds its per-test name filter with
`' '` and Vitest 5 matches against `' > '`, so every runtime mutant runs zero tests and is
reported Survived; only static mutants are really tested
([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210), open).
`coverageAnalysis: "off"` and `maxTestRunnerReuse: 1` don't help. I confirmed it by turning
on `if (!result.success)` → `if (false)` by hand in the sandbox
(`__STRYKER_ACTIVE_MUTANT__`): 10 of 13 env tests fail, yet Stryker reported it Survived.

Decision (user-approved): every `stryker.config.json` uses `testRunner: "command"` running
the package's hermetic Vitest config. The instrumented code reads the mutant id from
`__STRYKER_ACTIVE_MUTANT__`, which the command runner sets. The cost is that there is no
per-test coverage, so no `NoCoverage` status, no per-test kill data and no incremental mode.
Each mutant reruns the whole hermetic suite of its package, which takes about 1 s here.
Switch back to the vitest runner once #6210 is released.

A second artifact on the first web run: 28 of 39 mutants timed out. Parallel jsdom suites
ran past Stryker's default timeout under CPU load, so the score showed 89.7%. A mutant run by
hand finished in 2 s with 4 failing tests. `apps/web/stryker.config.json` sets
`timeoutMS: 10000`. Re-run at default and at `--concurrency 2`: 0 timeouts, 64.1% both times.

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| env.ts:23 | Regex | `/^\d+$/` → `/\d+$/` | strengthen | `PORT=+80` was accepted as 80. Added `+80` to the invalid-value table. |
| env.ts:23 | Regex | `/^\d+$/` → `/^\d+/` | strengthen | `PORT=8e3` was accepted as 8000. Added `8e3` to the table. |
| env.ts:42 | StringLiteral | `ConfigError.name` → `""` | accept | `main.ts` writes only `error.message`; callers use `instanceof`. |
| env.ts:46 | LogicalOperator, ConditionalExpression ×2 | `isEnvName` weakened to `\|\|` / `true` | equivalent | It only ever sees keys of `REASONS` (the loop) or `issue.path[0]` of the object schema, which is always one of those keys. |
| env.ts:54 | LogicalOperator, ConditionalExpression ×2 | `isEnvName(name) && value !== undefined` → `\|\|` / `true` | equivalent | `name` is always an env name; storing `undefined` is the same as leaving it unset, both for zod defaults and for the "Missing" check. |
| env.ts:59 | MethodExpression | `.filter(isEnvName)` dropped | equivalent | Same reason: every issue path starts with an env name. |
| env.ts:65 | StringLiteral | `lines.join('\n')` → `join('')` | strengthen | Several bad variables ran together on one stderr line. "lists every bad variable" now asserts one line per variable. |
| execute.ts:21 | LogicalOperator, StringLiteral | `errors[0]?.message ?? fallback` → `&&` / `` ` ` `` | strengthen | The error message was never asserted. Now asserts `message: 'boom'` for an errors payload and `HTTP <status>` for HTTP errors. |
| execute.ts:22 | StringLiteral | `this.name` → `""` | accept | Nothing reads `name`; callers use `instanceof GraphQLRequestError`. |
| execute.ts:34 | LogicalOperator, ConditionalExpression ×3 | `isResultOf` weakened | strengthen | A 200 with `{}`, `{ data: null }` or a non-JSON body resolved to `undefined` / `null` instead of throwing. New parametrised test over those three bodies. |
| execute.ts:43-45 | ObjectLiteral, StringLiteral ×2 | request headers dropped / emptied | strengthen | MSW parses the body whatever the headers, so the test was blind to them. The POST test now asserts `content-type: application/json` and that `accept` includes `application/graphql-response+json`. |
| execute.ts:56 | LogicalOperator ×2, ConditionalExpression ×2 | `!ok \|\| errors \|\| !data` weakened | strengthen | Partial data with `errors` resolved as success; a non-OK status with a JSON `data` body resolved as success. The errors test is parametrised with and without partial data, and the HTTP-error test with a non-JSON body (500) and a `data` body (502). |
| secret-scan.ts:7 | Regex | hunk header `^` anchor removed | strengthen | An added line containing `@@ -1 +9 @@` text was taken as a hunk header and not scanned, so a leak on that line was missed. New test. |
| secret-scan.ts:7 | Regex ×4 | hunk header counts `\d+` → `\d` or made required | strengthen | `-U0` emits `@@ -3 +7 @@` (no counts) and multi-digit counts. An unmatched header kept the old line number. New parametrised test over three header shapes. |
| secret-scan.ts:11 | EqualityOperator | `key.length >= 8` → `>` | strengthen | An 8-character key was not checked. New boundary test. |
| secret-scan.ts:13 | StringLiteral | initial `file = ''` → other text | equivalent | `git diff` always prints `diff --git` and `+++` before the first hunk, so `file` is set before any leak. |
| secret-scan.ts:17 | BooleanLiteral | initial `inFileHeader = false` → `true` | equivalent | Same: real diff output starts with `diff --git`, which sets it to `true` anyway. |
| secret-scan.ts:25 | Regex | `^` dropped from the `+++` replace | equivalent | The line is already known to start with `+++ `. |
| secret-scan.ts:25 | Regex | `(b\/)?` → `(b\/)` | strengthen | With `diff.noprefix=true` the header is `+++ a.ts` and the report named `+++ a.ts`. New test. |
| secret-scan.ts:34 | ConditionalExpression | `if (inFileHeader) continue` → never | equivalent | Header lines other than `+++ ` (`index`, `---`, mode, rename, `Binary files`) never start with `+` or a space. |
| secret-scan.ts:36 | MethodExpression | `text.slice(1)` → `text` | equivalent | The leading `+` can neither create nor break a match of the alphanumeric key or `access_key=`. |
| secret-scan.ts:37 | ConditionalExpression | `literalKey !== undefined` → `true` | strengthen | With no key, `includes(undefined)` searches for the text `"undefined"`, so the scanner would block any added line containing `undefined` in CI, where there is no `.env`. The short/unset key test is now `it.each` with such a line. |
| secret-scan.ts:43-44 | ConditionalExpression ×2, MethodExpression, StringLiteral, BlockStatement, AssignmentOperator | context-line counting broken | strengthen | "ignores removed and context lines" asserted only `[]`. It now adds a key after a removed and a context line and asserts it is reported on line 2. |

## Dead-weight tests

Not measurable this run: the command runner reports no per-test kills. Reading the tests, I
found none. The `access_key` table rows each pin a different boundary (16 vs 15 chars,
redaction markers, the sentinel). The two copies of the short-key assertion were folded into
one `it.each`.

## Gaps for the test plan

- None of the three targets was in *Mutation targets*. Added rows with these baselines:
  `env.ts` 83.0%, `execute.ts` 97.4%, `secret-scan.ts` 93.6% (100% of non-equivalent). `break`
  stays `null` until the user agrees a value.
- Stryker setup changed to the command runner (see *Runner*). Mutation runs now exist for
  `apps/web` (`pnpm --filter @property-manager/web test:mutation`) and tooling
  (`pnpm test:mutation:tooling`, config `tooling/stryker.config.json`). The tooling project
  moved from an inline root project to `tooling/vitest.config.ts`.
- `tooling/guardrails.test.ts` runs ESLint and tsc over the repo and cannot run in the narrow
  tooling sandbox. It is excluded from the mutation command. It guards configuration, not
  `secret-scan.ts`.
