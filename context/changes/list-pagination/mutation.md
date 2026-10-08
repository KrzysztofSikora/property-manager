# Mutation check: list-pagination

Targets: `apps/web/src/lib/list-search.ts` (whole file), `apps/web/src/hooks/useProperties.ts`
(whole file) · Tests: `apps/web/vitest.config.ts` (jsdom + MSW, hermetic), `--concurrency 2
--timeoutMS 60000`
Score: 97.37% -> 97.37% (74 / 2 / 0 / 0; killed / survived / no coverage / timeout)

- `list-search.ts`: 100% (54 / 0 / 0 / 0), up from 43 mutants in S-07. The new ones are the
  page parse (regex, `Number`, fallback 1) and the `page > 1` write.
- `useProperties.ts`: 90.91% (20 / 2 / 0 / 0). S-04 baseline was 95.0% with 1 survivor; the
  second survivor is a side effect of S-07 (see the city row). Test plan target 90%.

Why these targets: both are *Mutation targets* in `context/test-plan.md` and both changed in
S-08 (page parse and write; page → `limit` / `offset`). Skipped: `ListPage.tsx` (kept outside
Stryker by the plan; its pagination bounds are pinned by the TR-27 component tests),
`graphql/{gql,graphql}.ts` (generated), `test/render.tsx` (test helper).

Timeouts (lesson: re-run before recording): a first run of `useProperties.ts` alone at
`--concurrency 4` and the default `timeoutMS` 10000 gave 14 killed, 6 timeouts, 2 survived.
The timeouts were the empty query document, the query key and `queryFn`, and the
`(page - 1)` → `(page + 1)` offset: the jsdom suite slows down while every `findBy` waits
for rows that never come. At `--concurrency 2 --timeoutMS 60000` all 6 fail the tests and are
killed, so the score above has no timeouts.

Earlier `strengthen` rows (lesson: re-check when a change moves a rule's input):
- `useProperties.ts:27/29` (S-04, now `:30/:32`), `if (city.trim())` / `if (zipCode.trim())`
  → `if (city)` / `if (zipCode)`: still killed. The `/?city=+++` and `/?zip=+++` link test
  (S-07) reaches them with `limit: 20, offset: 0` added to its expected request.
- `ListPage.tsx:47` (S-07, `filtered` flag) is not in this run's scope. The test it relies on
  (`/?<key>=+++` → "No properties yet") is unchanged apart from the request object.

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `useProperties.ts:30` | MethodExpression | `filter.city = city.trim()` → `filter.city = city` | equivalent | S-04 killed it with a padded city typed in the form. Since S-07 `toListSearch` trims before writing the URL, so a padded city reaches the hook only from a hand-edited link (`/?city=+Austin+`). The API applies `normalizeAddressText` (trim and collapse) to the city filter (`properties-args.ts:20`), and the query key uses the untrimmed filter either way, so the rows and the cache are the same. Pinning the exact request would only mirror the implementation. |
| `useProperties.ts:32` | MethodExpression | `filter.zipCode = zipCode.trim()` → `filter.zipCode = zipCode` | equivalent | Unchanged from S-04: the API trims the zip filter (`properties-args.ts:22`), so results cannot differ. |

## Dead-weight tests

None that need folding. The new parse and write cases in `list-search.test.ts` are already
`it.each` tables. `gives page 1 for a missing page` overlaps with `gives no filter and newest
first for empty params` (both assert page 1 with no `page` key), but it keeps the other fields
valid (lesson "exactly one invalid field"), so it stays. The command runner has no per-test
coverage, so overlap between `ListPage.test.tsx` tests cannot be measured here.

## Gaps for the test plan

None. Both targets ran hermetic tests. The `useProperties.ts` row in `context/test-plan.md`
now records 90.91% after S-08 with 2 equivalent survivors, next to the S-04 baseline.
