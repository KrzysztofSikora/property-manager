# Plan: list-pagination (S-08)

## Goal and end state

The list page shows the matches 20 at a time (issue #10, roadmap *Later*). When S-08 is done:

- FR-11 AC4: with more than 20 matches, the page shows the first 20 rows. A pagination bar
  shows "Page 1 of N" with Previous and Next buttons, and the existing "N properties" line
  still shows the total. Next shows the next 20 rows (`limit: 20, offset: 20`).
- The page is kept in the URL next to the filters and sort (`/?city=Austin&page=2`), so reload,
  a shared link and browser Back keep it. Page 1 is the default and is left out of the URL.
- With 20 matches or fewer, no pagination bar is shown.
- A filter or sort change goes back to page 1. An Apply that leaves the filters as they are
  does not navigate and keeps the page.
- A page past the end (a `page=9` link with 3 pages, or deleting the only row on the last page)
  replaces the URL with the last page (no new history entry). If nothing matches, it replaces
  the URL with page 1 and the empty state shows.
- An invalid `page` (`0`, `-1`, `abc`, `1.5`, more than 6 digits) is ignored, so page 1 is
  shown. The URL is left as it is (S-07 Decision 3).
- FR-11 AC1–AC3, AC3a and AC5–AC7 still pass. Their exact-request assertions now also expect
  `limit: 20, offset: 0`. AC1's `not.toHaveProperty('limit')` assertion is replaced.

## Scope

- In:
  - `page` in `apps/web/src/lib/list-search.ts` (parse and write).
  - `useProperties` sends `limit` / `offset` for the page. Codegen output for the changed
    `Properties` document.
  - `ListPage`: the pagination bar, going back to page 1 on a filter or sort change, and
    moving a page past the end to the last page.
  - Unit and component tests. `context/test-plan.md` gets TR-27 and updated mutation-target
    descriptions. `context/roadmap.md` gets the S-08 row (already in the working tree).
- Out:
  - Numbered page links or jumping to a page (Decision 2).
  - A page-size selector. The size is fixed at 20 (FR-11 AC4).
  - API changes. `limit` / `offset` already exist (FR-01 AC4, AC5; `apps/api/schema.graphql:82-83`).
  - A Playwright pagination journey (it would need 21+ creates through the stub; user agreed
    at the phase review).

## Findings

- The API already pages: `properties(filter, sort, limit: Int, offset: Int = 0)` with `limit`
  1–100 (`apps/api/schema.graphql:76-83`, FR-01 AC4/AC5). `totalCount` counts every match, not
  only the page (FR-01 AC4), so the page count is `ceil(totalCount / 20)`.
- The web document does not declare `$limit` / `$offset` yet
  (`apps/web/src/hooks/useProperties.ts:6-20`). `PropertiesQueryVariables` has only `filter`
  and `sort` (`apps/web/src/graphql/graphql.ts:47-50`). Adding the variables needs
  `pnpm codegen`, and the output is committed (TR-23 drift check).
- `useProperties.ts:36` says "No `limit`: the list shows every match (pagination is #10)". The
  query key is `['properties', 'list', { filter, sort }]`. The create and delete hooks
  invalidate `['properties', 'list']` (`useCreateProperty.ts:26`, `useDeleteProperty.ts:21`).
  That is a prefix of `['properties', 'list', { filter, sort, page }]`, so a key with `page` in
  it is still invalidated after a create or a delete.
- `placeholderData: keepPreviousData` (`useProperties.ts:39`) keeps the old page's rows during a
  page change, and the "Updating…" status shows (`ListPage.tsx:144`). The past-the-end check
  must skip placeholder data. Otherwise it would act on the previous key's rows. During
  placeholder data the label would also pair the new `page` with the old `totalCount`; the
  TanStack paginated-queries guide disables Next while `isPlaceholderData`
  (github.com/tanstack/query, `docs/framework/react/guides/paginated-queries.md`).
- `ListPage.tsx:45-46` compares the whole canonical URL to decide whether Apply navigates.
  Once `page` is in the URL, Apply with unchanged filters on page 3 would differ only by the
  dropped `page`, so the comparison has to use the filter part only (Decision 5).
- The filter form key is `toListSearch({ filter, sort: 'CREATED_AT_DESC' })` (`ListPage.tsx:59`).
  With `page` defaulting to 1 in that call, a page change does not remount the form, so typed
  but unapplied text survives it, as it does for a sort change.
- `ListPage.test.tsx`: `propertiesPayload` sets `totalCount = items.length` (`:38-40`).
  Pagination tests need a payload whose `totalCount` is larger than `items`. Every `toEqual`
  on `requests` gains `limit: 20, offset: 0`: the one-line assertions at
  `:155-156, 238, 298, 349, 428, 441` and the multi-line ones at `:221-224` (AC3 city + state)
  and `:268-273` (AC3a deep link).
- Lesson "Re-check earlier mutation-strengthened tests": the `strengthen` rows for the touched
  lines are `useProperties.ts:27,29` (S-04, the whitespace tests at `:415-445`),
  `ListPage.tsx:12` (S-04, the AC2 test going back to "Newest first", which maps
  `variables.sort` and is not affected), and the "filtered" flag now at `ListPage.tsx:49`
  (S-04 row `ListPage.tsx:43` in `list-and-details-pages/mutation.md:42`, the whitespace-only
  empty-state test; S-07 row `ListPage.tsx:47`, the `/?city=+++` link test). None of these inputs move in S-08. Only their expected request objects gain
  `limit` / `offset`, so each test still reaches its line. Check again in `/mutation`.
- React Router (reactrouter.com/api/hooks/useSearchParams, checked in S-07):
  `setSearchParams(next, { replace: true })` replaces the current entry instead of pushing.
- GraphQL `Int` is 32-bit. With a 6-digit cap on `page`, the largest offset is
  `999 998 × 20 = 19 999 980`, so it stays in range and a long `page` can't turn into a
  `BAD_USER_INPUT` error.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| Page in the URL or in component state? | URL, `page=N`, page 1 left out | Reload, shared links and Back keep the page, the same as filters and sort (S-07). | user |
| Control shape | Previous / Next buttons and a "Page X of Y" label | Meets AC4 (current page and total) with the least markup and logic. | user |
| Page past the end | Replace the URL with the last page (page 1 when nothing matches). No history entry. | After the last row on the last page is deleted, the user still sees rows. | user |
| Phases | Two: URL module, then the paged list. No Playwright step. | Two small diffs. E2E would need 21+ creates for little extra coverage. | user |
| Behaviour when a filter or sort changes while on page N | Go back to page 1 (the write leaves `page` out) | Page N of the old result means nothing for the new one. | research |
| Apply with unchanged filters while on page N | No navigation, the page is kept. The comparison uses the filter part of the URL only. | Keeps S-07's "an unchanged Apply pushes nothing", and pressing Enter again doesn't throw away the page. | research |
| Page size and where it lives | `PAGE_SIZE = 20`, exported from `useProperties.ts` | FR-11 AC4 fixes 20. The hook turns a page into `limit` / `offset`, and the page reads the constant for the page count. | research |
| `page` validation | `^[1-9]\d{0,5}$`, otherwise page 1 (per-field `.catch`, like the other fields) | Rejects 0, negatives, decimals and `+1`. The cap keeps the offset inside GraphQL `Int`. | research |
| When the pagination bar shows | Only when `totalCount > 20` | FR-11 AC4 is "given more than 20 matches". A one-page list stays as it is today. | research |
| Previous / Next at the ends | Rendered but `disabled` on page 1 / the last page | A stable layout, and the state is clear to screen readers. | research |
| Previous / Next history | Push, like sort and Apply | Back undoes the last page move (S-07 Decision 2). | research |
| Where the bar renders, and during placeholder data | Only in the rows branch, below the table. Previous and Next are both `disabled` while `isPlaceholderData`; the label may show the old total until the request settles, covered by "Updating…". | Outside the rows branch, the past-the-end flash would show "Page 9 of 3" next to the empty state. Disabling during placeholder data stops double clicks from skipping past pages the user never saw (TanStack guide). | research (plan review #4) |

## Design

`apps/web/src/lib/list-search.ts`:

- `ListState` becomes `{ filter: PropertiesFilter; sort: PropertySort; page: number }`.
- Schema field `page: z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).catch(1)` (read with
  `params.get('page')`). A missing `page` gives 1.
- `toListSearch({ filter, sort, page })`: `page` is optional and defaults to 1. It is written
  last and only when `page > 1`. The key order becomes `city`, `state`, `zip`, `sort`, `page`.
  Calls that leave `page` out (filter and sort changes, the form key) give page 1.

`apps/web/src/hooks/useProperties.ts`:

- `export const PAGE_SIZE = 20`.
- `useProperties({ filter, sort, page })`: the document declares `$limit: Int, $offset: Int`.
  Variables `limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE`. The query key becomes
  `['properties', 'list', { filter, sort, page }]`.

`apps/web/src/pages/ListPage.tsx`:

- `const { filter, sort, page } = parseListSearch(searchParams)`, passed to `useProperties`.
- Apply: navigate only when `toListSearch({ filter: next, sort })` differs from
  `toListSearch({ filter, sort })`, both written without `page`. When it navigates, `page` is
  left out (page 1).
- Sort change: `toListSearch({ filter, sort: new })`, so page 1.
- `pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))`.
- A `<nav aria-label="Pagination">` below the table, inside the rows branch (next to the
  table, not shared with the loading, error or empty states), rendered only when
  `totalCount > PAGE_SIZE`. It holds a "Previous" button (disabled when `page === 1` or
  `isPlaceholderData`), a `Page {page} of {pageCount}` text and a "Next" button (disabled when
  `page >= pageCount` or `isPlaceholderData`).
  Each button calls `setSearchParams(toListSearch({ filter, sort, page: page ± 1 }))` (push).
- Past the end: a `useEffect` on the query result. When the data is not placeholder data,
  `items.length === 0` and `page > 1`, it calls
  `setSearchParams(toListSearch({ filter, sort, page: lastPage }), { replace: true })`, with
  `lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))`. When it fires there are 0 rows,
  so the empty state may flash for one request. That is accepted.

Data flow: URL → `parseListSearch` → `useProperties` (`limit` / `offset`) → API. The buttons
and the past-the-end effect write the URL. There is no new error model: an invalid `page` is
dropped by the parse, and request errors use the existing error state with Retry.

## Phases

### Phase 1: page in the URL module

- Files:
  - `apps/web/src/lib/list-search.ts`: add `page` to `ListState`, to the schema and to
    `toListSearch` as in *Design*. Contract: `parseListSearch(params): { filter; sort; page:
    number }`. `toListSearch({ filter, sort, page? })` writes `page` last and only when
    `page > 1`.
  - No change to `useProperties.ts` or `ListPage.tsx` in this phase. `ListPage.tsx:27` already
    destructures `{ filter, sort }`, and `page` is optional in `toListSearch`, so the existing
    callers still typecheck and behave as before.
  - `apps/web/src/lib/list-search.test.ts`: parse cases, each with the other fields valid
    (lesson "exactly one invalid field"): missing → 1; `page=2` → 2; `page=999999` → 999999;
    `page=1000000`, `0`, `-1`, `02`, `1.5`, `abc`, `+2`, `''` → 1; repeated `page` → the first
    one. Write cases: page 1 and a missing page are left out, `page=3` is written after `sort`,
    and the full key order is `city`, `state`, `zip`, `sort`, `page`. The round trip includes
    `page`. Update the existing parse expectations to include `page: 1`.
  - `context/test-plan.md`: new risk row TR-27 (AC4: wrong `limit` / `offset`, the page is not
    kept in the URL, it is not reset after a filter or sort change, a page past the end shows
    an empty list, or the controls show the wrong page or total). TR-27 names the component
    tests that pin each bound, because the bounds live in `ListPage.tsx`, which stays outside
    Stryker (no helper is extracted just to bring them under mutation): 20 vs 21 matches for
    `totalCount > PAGE_SIZE`, Previous disabled on page 1, Next disabled on the last page for
    `page >= pageCount`, and `/?page=9` → `?page=3` plus the delete on page 3 for the
    past-the-end check and `lastPage`. Extend the `list-search.ts`
    mutation-target description with "page parse and write", and the `useProperties.ts` one
    with "page → `limit` / `offset`".
  - `context/roadmap.md`: commit the S-08 Overview row and the *Later* #10 note (already in the
    working tree). `Refs #10`.
- Proves: the page parse and write rules behind FR-11 AC4 (unit, Vitest `web` project).
- Agent checks: `pnpm typecheck`, `pnpm lint`,
  `pnpm vitest run --project web src/lib/list-search.test.ts`, `pnpm test:unit`.
- Human checks: none.

### Phase 2: paged list

- Files:
  - `apps/web/src/hooks/useProperties.ts`: `PAGE_SIZE`, the `$limit` / `$offset` variables,
    the `page` input and query key as in *Design*. Remove the "pagination is #10" comment.
    Contract: `useProperties({ filter, sort, page })`; the request has
    `limit: 20, offset: (page - 1) * 20`.
  - `apps/web/src/graphql/{gql,graphql}.ts`: regenerated by `pnpm codegen`.
    `PropertiesQueryVariables` gains `limit` and `offset`.
  - `apps/web/src/pages/ListPage.tsx`: the pagination `<nav>`, Apply compared on the filter
    part only, page 1 after a filter or sort change, and the past-the-end effect, as in
    *Design*. Contract: route `/` accepts `?…&page=N`.
  - `apps/web/src/pages/ListPage.test.tsx`: a payload helper with an explicit `totalCount` (for
    example `pagePayload(items, totalCount)`), and a handler that serves the slice for
    `limit` / `offset` from a list of 45 fixtures. New tests:
    - AC4: 45 matches → 20 rows, "Page 1 of 3", "45 properties", Previous disabled. The first
      request is `{ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 }`.
    - AC4: Next → rows 21–40, "Page 2 of 3", URL `?page=2`, request `offset: 20`. Next again →
      5 rows, Next disabled. Previous → page 2.
    - AC4: exactly 20 matches → no "Pagination" navigation. 21 matches → it shows (bound).
    - AC4: opening `/?city=Austin&page=2` sends `{ filter: { city: 'Austin' }, offset: 20 }`
      and shows "Page 2 of 3".
    - AC4: on `?page=2`, applying a new city goes to page 1 (URL without `page`, `offset: 0`).
      On `?page=2`, a sort change goes to page 1 the same way.
    - AC4: on `?city=Austin&page=2`, Apply with the city unchanged keeps the URL and sends no
      new request.
    - AC4: Back after Next returns to page 1 (URL and rows).
    - AC4: opening `/?page=9` with 45 matches replaces the URL with `?page=3` and shows its 5
      rows. Back then does not return to `?page=9`: the probe's history goes to the entry
      before (`/` as the initial route, set with `initialEntries`).
    - AC4: with 41 matches on `?page=3` (1 row), deleting that row lands on `?page=2` with
      20 rows.
    - AC4: opening `/?page=2` with 0 matches shows "No properties yet", the URL is empty, and
      no "Pagination" navigation shows.
    - AC4: while the next page's request is pending (a handler held on a deferred promise),
      Previous and Next are disabled and "Updating…" shows; once it resolves they are enabled.
    - AC4: an invalid `page=abc` with `city=austin` sends `offset: 0` and the city filter (one
      invalid field).
    - Changed: every `toEqual` on `requests` (`:155-156, 221-224, 238, 268-273, 298, 349,
      428, 441`) gains `limit: 20, offset: 0`. AC1's `not.toHaveProperty('limit')` becomes an assertion that
      `limit` is 20 and no pagination bar shows for 3 matches.
  - `apps/web/src/test/render.tsx`: only if the Back test needs more than one initial entry
    (an `initialEntries` option next to `route`). Keep `route` as it is.
  - `context/test-plan.md`: TR-27 → `covered (S-08)` with the test files and the names of the
    bound tests.
  - `context/roadmap.md`: S-08 → `done` in the final commit (`Closes #10`), as in earlier items.
- Proves: FR-11 AC4 (component level with Testing Library + MSW and a router probe), and that
  FR-11 AC1–AC3, AC3a and AC5–AC7 still pass. The existing Playwright journey (fewer than 20
  rows) still passes with `limit: 20` sent.
- Agent checks: `pnpm codegen` (output committed, no drift), `pnpm typecheck`, `pnpm lint`,
  `pnpm vitest run --project web`, `pnpm test:unit`, `pnpm e2e` (Docker running).
- Human checks: in `pnpm dev` with more than 20 properties (create them through the API, or
  insert test rows in the dev database): Next / Previous, "Page X of Y" and the total. Reload
  on page 2. Back and Forward. A filter change goes to page 1. Delete the last row on the last
  page. Edit the URL to `page=99`. Check that the bar reads well and that the buttons are
  disabled at the ends.

## Risks and unknowns

- The past-the-end effect shows the empty state for one request before the replace. Accepted
  (Decision 3); the test waits for the final rows. Resolved.
- Properties created or deleted elsewhere between page loads can shift rows across pages
  (offset paging). Accepted for a single-user app with no auth. Resolved.
- Getting 21+ properties for the human check costs Weatherstack quota if created through the
  real API. Use the dev database or a stubbed `WEATHERSTACK_BASE_URL` (the e2e stub). Resolved.
- No `BLOCKING` unknowns.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: page in the URL module (5069c19)
- [x] Phase 2: paged list (879e6f9)

## Deviations
- Phase 2: the past-the-end check is `page > pageCount` on settled, non-placeholder data, not
  `items.length === 0 && page > 1`. Same result with a consistent API, and it cannot loop on
  replace if the API returns no rows for a page inside its own count.
- Phase 2: added a test the plan did not list, "Back to page 3 from a filter with fewer
  matches…". A hand mutation that dropped the `isPlaceholderData` guard from the past-the-end
  check survived every planned test.
- Phase 2: `renderListWithProbe` and `renderWithProviders` take `initialEntries` (earlier
  history entries before `route`), as the plan allowed for the Back test.
- Review R1: while the next page loads, Previous / Next use `aria-disabled` plus an early return
  instead of `disabled` (Decisions, "Previous / Next at the ends"), so the pressed button keeps
  keyboard focus. `disabled` stays for page 1 and the last page.
