# Plan review: list-pagination

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | minor | Grounding | The plan says "The delete hook invalidates `['properties']`". The hooks actually invalidate `['properties', 'list']` (`apps/web/src/hooks/useDeleteProperty.ts:21`, `useCreateProperty.ts:26`). The conclusion still holds, because it is a prefix of `['properties', 'list', { filter, sort, page }]`. | Correct the key in *Findings*. |
| 2 | minor | Grounding / Traceability | The list "Exact-request assertions at `:155-156, 238, 298, 349, 428, 441`" leaves out the multi-line `toEqual` assertions at `ListPage.test.tsx:221-224` (AC3 city + state) and `:268-273` (AC3a deep link). Both compare the whole request object, so both fail once `limit` / `offset` are sent. | Add `:221` and `:268` to the list. A simpler option is to say "every `toEqual` on `requests`". |
| 3 | minor | Traceability (lesson "exactly one invalid field" / mutation) | The Phase 1 case `01` → 1 can't fail. `Number('01')` is 1, so a regex that allowed leading zeros would give the same result. `+2`, `1.5`, `0` and `''` do tell the cases apart. | Use `02` → 1 (or `010` → 1) in place of `01`. |
| 4 | minor | Design | "A `<nav aria-label="Pagination">` below the table" doesn't say which render branch the nav goes in. If it sits outside the rows branch (`ListPage.tsx:228`), the past-the-end flash shows "Page 9 of 3" next to the empty state. Separately, while `keepPreviousData` is showing the old rows, the label pairs the new `page` with the old `totalCount`. The TanStack paginated-queries guide disables Next while `isPlaceholderData` (https://github.com/tanstack/query/blob/main/docs/framework/react/guides/paginated-queries.md). | Say that the nav renders only in the rows branch. Either disable Previous / Next while `isPlaceholderData`, or record that the "Updating…" status covers this case. |
| 5 | minor | Lessons / mutation | The new boundary logic lives in `ListPage.tsx`: bar shown when `totalCount > PAGE_SIZE`, `page >= pageCount`, the past-the-end condition and `lastPage`. `ListPage.tsx` is not a mutation target (`context/test-plan.md:112-126`). Phase 1 only extends the `list-search.ts` and `useProperties.ts` descriptions. Only component tests guard these off-by-one points. They do cover them (20/21 matches, Previous disabled on page 1, Next disabled on page 3). | In TR-27, name the component tests that pin each bound. That makes it explicit that `ListPage.tsx` stays outside Stryker. Don't extract a helper just to get it under mutation. |
| 6 | minor | Lessons | The `strengthen` row cited as "`ListPage.tsx:47` (S-07)" now sits at `ListPage.tsx:49` (`const filtered = …`). The S-04 row for the same rule (`ListPage.tsx:43`, `list-and-details-pages/mutation.md:42`) is not listed. Neither input moves in S-08, so the conclusion stands. | Use the current line, and list the S-04 row next to the S-07 one for `/mutation`. |

## What is good

- The plan answers its roadmap item. S-08 / #10 is FR-11 AC4 (`context/roadmap.md` diff), and AC4 is proved at component level. Each Decisions row carries a reason and an owner, and no unknown is `BLOCKING`.
- The grounding checks out:
  - `schema.graphql:76-83` (`limit: Int`, `offset: Int = 0`).
  - `PropertiesQueryVariables` with only `filter` / `sort` (`graphql.ts:47-50`).
  - The `useProperties.ts` comment, query key and `keepPreviousData` (`:36`, `:35`, `:39`).
  - The Apply comparison (`ListPage.tsx:45-46`), the form key (`:59`) and "Updating…" (`:144`).
  - `propertiesPayload` (`ListPage.test.tsx:38-40`) and `not.toHaveProperty('limit')` (`:156`).
- The plan spots that the past-the-end check must skip placeholder data, and that Apply must compare only the filter part. These are the two traps most likely to cause loops or lost pages.
- The `page` validation is tight. The regex rejects `0`, `+2` and decimals, and the 6-digit cap keeps the offset in GraphQL `Int` range (the arithmetic is right). The parse cases keep the other fields valid and test the 999999 / 1000000 boundary.
- The phasing is sound. Phase 1 is a pure-module change that leaves callers typechecking (`page` is optional in `toListSearch`). Phase 2 lists codegen, the TR-23 drift check and `pnpm e2e`. The e2e stack uses `down -v`, so a fresh DB keeps the journey under 20 rows.
- The scope is disciplined. There are no API changes, no page-size selector and no numbered links. Dropping the Playwright step was agreed with the user, and the plan gives a reason.
