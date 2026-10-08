# Mutation check: list-filters-in-url

Targets: `apps/web/src/lib/list-search.ts` (whole file), `apps/web/src/pages/ListPage.tsx:24-60`
and `:96-104` · Tests: `apps/web/vitest.config.ts` (jsdom + MSW, hermetic), `--concurrency 4`
Score: 94.20% -> 95.65% (before 64 / 4 / 0 / 1, after 65 / 3 / 0 / 1; killed / survived /
no coverage / timeout)

- `list-search.ts`: 100% -> 100% (43 / 0 / 0 / 0). This is the first run and its baseline
  (test plan target 90%).
- `ListPage.tsx` URL logic: 84.62% -> 88.46% (21 / 4 / 0 / 1 -> 22 / 3 / 0 / 1). The lines
  are the parse of the URL, Apply with its "URL unchanged" skip, the `filtered` flag, the form
  key and the sort change. The rest of the page is presentation.

Why these targets: `list-search.ts` is the test plan's mutation target for S-07 (query
building: per-field fallbacks, state upper-casing, trimmed write, default sort left out).
`ListPage.tsx` holds the change's other decisions (skip a navigation that would not change the
URL, form key without the sort). S-04 ran the same page range (`list-and-details-pages`).
Skipped: `e2e/property-journey.spec.ts` (test code).

Timeouts (lesson: re-run before recording):
- `ListPage.tsx:28` `useProperties({ filter, sort })` → `useProperties({})` still times out
  alone at `--concurrency 1`. It is a real hang: the page stays loading. It counts as caught.
- After the new test, `ListPage.tsx:47` `value.trim() !== ''` → `true` timed out at
  concurrency 4. Alone at `--concurrency 1` it is killed, so the after-score counts it as
  killed.

## Mutants
| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `ListPage.tsx:47` | MethodExpression | `value.trim() !== ''` → `value !== ''` | strengthen | Regression from this change. S-04 killed it with the whitespace Apply test, but a whitespace Apply now leaves the URL as it is, so `filter` never holds `'   '` that way. A link still can: the parse keeps `city=+++` (the request side trims in `useProperties.toFilter`). New `it.each(['city', 'zip'])` in `ListPage.test.tsx` (FR-11 AC6): opening `/?<key>=+++` sends `filter: {}` and shows "No properties yet", not "No properties match the filters". |
| `ListPage.tsx:33` | CallExpression | `event.preventDefault()` removed | accept | Same decision as S-04: jsdom does not navigate, so a unit test could only assert `defaultPrevented`. The E2E journey now catches it. A native GET submit leaves `/?city=Fountain+Hills&state=&zipCode=`, which fails the anchored `toHaveURL(/\?city=Fountain\+Hills$/)` added for TR-26. |
| `ListPage.tsx:57` | StringLiteral | form key `sort: 'CREATED_AT_DESC'` → `sort: ""` | equivalent | `toListSearch` writes `sort` only for `CREATED_AT_ASC`. Any other value leaves it out, so the key string is identical. |
| `ListPage.tsx:101` | ConditionalExpression | `isPropertySort(...)` → `true` | equivalent | Same as S-04 (`ListPage.tsx:17`): the select offers only listed values, and the guard only narrows the type. |

## Dead-weight tests

None found. The command runner reruns the whole `web` suite per mutant, so it cannot attribute
kills to single tests. The `list-search.test.ts` tables are already parametrised (`it.each`).
The AC6 whitespace-Apply test no longer kills the `:47` mutant. It stays because it pins a
different behaviour: a blank Apply pushes no history entry and sends no request.

## Gaps for the test plan

- The S-04 gap "the filter form not reloading the page (`preventDefault`) belongs to E2E" is
  closed by the TR-26 step in `e2e/property-journey.spec.ts`, as long as its `toHaveURL` regex
  stays anchored with `$`.
