---
name: mutation
description: Measure whether the tests of a change actually defend its logic, using Stryker mutation testing on a narrow set of risk-critical modules. Triages every surviving mutant and strengthens assertions only where a real bug would slip through. Writes context/changes/<change-id>/mutation.md.
argument-hint: "<change-id> | <path[:start-end]>"
disable-model-invocation: true
---

# Mutation check

Coverage tells you that code ran during tests. Mutation testing tells you whether the tests
would notice if that code were wrong. Stryker makes many small deliberate faults (flips `>`
to `>=`, negates a condition, empties a block, swaps `&&` for `||`) and reruns the relevant
tests against each one:

- **killed:** a test failed, so the fault was caught.
- **survived:** every test still passed, so no assertion guards that spot.
- **no coverage:** no test even executed the code.
- **timeout:** the fault hung the tests. It counts as caught.
- **compile error / ignored:** excluded from the score.

`score = (killed + timeout) / (killed + timeout + survived + no coverage)`

The score is only a pointer. The useful output is the list of surviving mutants and a
decision on each.

## Input

- `$ARGUMENTS`: a change-id (its changed logic files are the targets), or a file path with an
  optional line range, e.g. `apps/api/src/weather/weatherstack.adapter.ts:10-80`.
- `context/test-plan.md`, section *Mutation targets*, if present.
- `context/changes/<change-id>/plan.md` for the behaviours the change must guarantee.

## 1. Choose targets

Mutate only code where a silent bug hurts: domain rules, input validation, mapping of
third-party responses, error mapping, and query building (filters, sorting). Skip GraphQL
wiring, generated code, configuration, pure presentation components and constants.
For a change-id, intersect `git diff --name-only <base>...HEAD` with that list. Tell the user
which files you will mutate and why, in one line each.

## 2. Make sure Stryker is set up

If `stryker.config.json` is missing in the target package, propose this setup and wait for
approval. Check the current option names with context7 before writing it.

- Dev dependency: `@stryker-mutator/core`. Not `@stryker-mutator/vitest-runner`: 10.0 runs
  zero tests per runtime mutant on Vitest 5 (stryker-js#6210), so every mutant "survives".
  Revisit when a fixed release ships.
- A hermetic Vitest config (no database, no network), so a run takes minutes, not hours.
- `stryker.config.json`: `testRunner: "command"` with `commandRunner.command` running
  `node_modules/.bin/vitest run -c <hermetic config>`, `coverageAnalysis: "off"`, reporters
  `clear-text`, `progress`, `html` and `json` writing to `reports/mutation/`, `mutate: []`
  (targets come from `--mutate`). Raise `timeoutMS` if parallel runs time out on load
  (jsdom suites). Set the `break` threshold to `null` until the first baseline exists.
- A `test:mutation` script, and `reports/` in `.gitignore`.

## 3. Run

`pnpm --filter <package> test:mutation --mutate "<file>[:start-end]" ...`

If Stryker reports that no tests ran for a file, that file has no hermetic tests. Record it
as a test-plan gap. Do not widen the scope to make the error go away.

## 4. Triage every surviving and uncovered mutant

Read the JSON report. For each mutant, ask: **would a real bug of this shape hurt a user or
break a requirement?** Then give it one decision:

| Decision | When | Action |
|----------|------|--------|
| `strengthen` | The fault changes observable behaviour that a requirement or AC covers | Add or sharpen an assertion on that behaviour |
| `equivalent` | The fault cannot change any observable outcome | No test. Explain in one line |
| `accept` | The behaviour changes, but pinning it would only mirror the implementation (log text, exact wording, incidental object shape) | No test. Explain in one line |
| `bug` | The mutant shows the production code is already wrong | Stop and report it to the user. Do not fix it here |

Also flag **dead-weight tests**: tests that kill nothing beyond what other tests already
kill, usually copies with one changed input. Suggest folding them into one parametrised test
(`it.each`).

## 5. Strengthen and re-run

- Write assertions about behaviour as seen at the boundary: return values, the GraphQL
  response, the stored row, the error code. Never assert on private details just to kill a
  mutant.
- Prefer extending an existing test or a parametrised table over a new copy of the setup.
- Never edit production code in this skill.
- Re-run Stryker on the same targets. Record the score before and after.

## Output: `context/changes/<change-id>/mutation.md`

```markdown
# Mutation check: <change-id>

Targets: <files and line ranges> · Tests: <hermetic config used>
Score: <before>% -> <after>% (killed / survived / no coverage / timeout)

## Mutants
| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|

## Dead-weight tests
## Gaps for the test plan
```

Finish with a three-line summary for the user: the score change, the number of tests added
or merged, and any `bug` found. If a survivor points to a recurring weakness (e.g. "error
mappers are only checked for type, not code"), suggest a rule for `context/lessons.md`.

## Rules

- Do not chase 100%. A survivor you decided to accept, with a reason, is a valid result.
- Keep runs narrow. A full-repo run is the exception and needs the user's approval.
- Do not raise the CI `break` threshold above the agreed baseline without the user's approval.
