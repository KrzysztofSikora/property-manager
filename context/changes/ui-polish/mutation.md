# Mutation check: ui-polish

Targets: `apps/web/src/lib/format.ts` (whole file: `epaIndexLabel` regression, new
`epaIndexTone` at `:27-35`), `apps/web/src/hooks/useProperties.ts` (listed target; only the
query document changed) · Tests: `apps/web/vitest.config.ts` (command runner)
Score: `epaIndexTone` baseline 100% (24 / 0 / 0 / 0); `epaIndexLabel` 100% (18 / 0 / 0 / 0,
unchanged since S-09); `useProperties.ts` 90.91% (20 / 2 / 0 / 0, unchanged since S-08)
(killed / survived / no coverage / timeout). No tests added.

Before the run, the plan's "no new mutation target" was reconciled with the new
`epaIndexTone` rule (D-9): the user chose to extend the `format.ts` row in
`context/test-plan.md` *Mutation targets* to cover it (lesson "Add a module to *Mutation
targets* before running Stryker on it").

Timeouts (lesson: re-run before recording): the first run of both files at `--concurrency 4`
and `timeoutMS` 10000 gave 55 killed, 7 timeouts, 2 survived. All 7 timeouts were in
`useProperties.ts` (empty query document, query key, `queryFn`, `page + 1`), the same set
S-08 saw. Re-run of `useProperties.ts` alone at `--concurrency 2 --timeoutMS 60000`: all 7
fail the tests and are killed, so the scores above have no timeouts.

Lesson "Re-check earlier mutation-strengthened tests when a change moves a rule's input":
`toFilter` and the variables still read the same `useProperties` arguments; only the selection
set gained `weatherData.current { temperature weatherDescriptions weatherIcons }`. The S-04 /
S-08 tests still reach the lines (every non-equivalent mutant there is killed).

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `useProperties.ts:37` | MethodExpression | `filter.city = city.trim()` → `city` | equivalent | Same survivor as S-08 at `:30` (`changes/list-pagination/mutation.md`): `toListSearch` trims before writing the URL, and the API trims and collapses the city filter (`properties-args.ts:20`), so rows and cache are the same. |
| `useProperties.ts:39` | MethodExpression | `filter.zipCode = zipCode.trim()` → `zipCode` | equivalent | Same survivor as S-08 at `:32`: the API trims the zip filter (`properties-args.ts:22`). |

All 24 `epaIndexTone` mutants (equality and range operators, `||` / `&&` swaps, boundary
shifts, string literals, emptied branches) are killed by the `format.test.ts` table, whose
rows sit on each band edge (0, 1, 2, 3, 4, 6, 7).

## Dead-weight tests

None. Each `epaIndexTone` row guards a different edge: 0 and 7 the neutral fallback on both
sides, 1 the good branch, 2 and 3 each side of the `||`, 4 the `>=` bound, 6 the `<=` bound.
Index 5 is not in the table and is not needed (no mutant needs it).

## Gaps for the test plan

None. `epaIndexTone` now has its row in *Mutation targets* (extended `format.ts` row).
