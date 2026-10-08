# Plan: list-filters-in-url (S-07)

## Goal and end state

The list page keeps its view in the URL query string (issue #9, roadmap *Later*). When S-07 is
done:

- FR-11 AC3a: after Apply, the URL query string holds the filters that were set, e.g.
  `/?city=Fountain+Hills&state=AZ&zip=85268`. Reloading that URL, or opening it in a new tab,
  shows the same filter values in the inputs and the same matching rows.
- The sort is kept the same way (`sort=asc` for "Oldest first"; newest first is the default and
  is left out of the URL).
- Each Apply and each sort change pushes a history entry, so browser Back restores the previous
  filters and sort, both in the inputs and in the rows.
- An invalid value in the URL (`state=XX`, `sort=foo`, a 101-character city, a 6-character zip)
  is ignored. The list behaves as if that value were not set, and the URL stays as it is.
- An Apply that leaves the URL as it is (the same filters, or only whitespace typed) does not
  navigate, so it adds no history entry and sends no new request.
- FR-11 AC1–AC3 and AC5–AC7 still pass. Their tests stay unchanged, except the AC6
  whitespace-only test, which changes because a blank Apply no longer re-fetches (Phase 2).

## Scope

- In:
  - A pure module that converts `URLSearchParams` to the list state `{ filter, sort }` and back,
    validated with zod.
  - `ListPage` reads its filter and sort from `useSearchParams` and writes them on Apply and on
    sort change. They no longer live in component state.
  - Unit table for the module, `ListPage` tests for AC3a, and a reload step in the Playwright
    journey.
  - `context/test-plan.md`: a new TR row for AC3a and the new module as a mutation target.
  - `context/roadmap.md`: an Overview row for S-07, and the *Later* entry #9 pointing to it.
    Both are already in the working tree (uncommitted); they go into the Phase 1 commit.
- Out:
  - Pagination in the URL (FR-11 AC4, #10).
  - Keeping the filters when the user returns through the "Properties" nav link or the details
    page's "Back to properties" link. These go to `/`. Browser Back restores the filters.
  - Rewriting an invalid URL to its clean form (Decision 3).
  - API changes. The `properties` query and `useProperties` stay as they are.

## Findings

- `apps/web/src/pages/ListPage.tsx:26-28` keeps `filter` and `sort` in `useState`, and the
  comment there already points to #9. Filters apply on submit (`applyFilter`, `:33-41`) from an
  uncontrolled form read through `FormData`. Sort applies on change (`:80-84`) and is guarded by
  `isPropertySort`.
- The form inputs are uncontrolled and have no `defaultValue` (`:52-71`). If they are filled
  from the URL, they also have to update when the URL changes without a remount (browser Back).
  Remounting the form with a key built from the filter part of the URL and setting
  `defaultValue` covers both cases and keeps the existing submit-by-`FormData` flow. Keying by
  the filter part only (not the whole search string) keeps typed but unapplied text through a
  sort change, as today.
- `apps/web/src/pages/ListPage.test.tsx:275-291` (AC6, "a whitespace-only %s is a blank
  filter") types `'   '`, clicks Apply and waits for a second request. Today `'   '` is a new
  query key. Under this plan the serializer drops it, the URL does not change, and no second
  request is sent, so this test has to change.
- `apps/web/src/hooks/useProperties.ts:26-32` (`toFilter`) already trims values and drops blank
  ones before the request, and it is a mutation target (`context/test-plan.md:122`). The URL
  module does not repeat that rule for the request. It only makes sure the URL holds no blank
  or untrimmed values.
- The query key is `['properties', 'list', { filter, sort }]`. TanStack Query hashes the key
  structurally, so a new object from each URL parse does not trigger a re-fetch.
- The State select only offers `US_STATES` codes (`packages/shared/src/states.ts`,
  `isStateCode`). A `state=XX` from the URL cannot be shown in the select, so it has to be
  dropped (Decision 3). City has `maxLength={100}` and zip has `maxLength={5}` in the form
  (`ListPage.tsx:53,69`). The URL schema uses the same bounds, so the URL can't hold a value the
  inputs can't show.
- Tests render through `renderWithProviders(ui, { route })` with a `MemoryRouter`
  (`apps/web/src/test/render.tsx`). The `route` option already lets a test open
  `/?city=…`. To check the URL and to go Back, a test needs a small probe inside the router
  (`useLocation` / `useNavigate(-1)`) next to `<ListPage />`.
- React Router (current docs, reactrouter.com/api/hooks/useSearchParams):
  `useSearchParams()` returns `[URLSearchParams, setSearchParams]`. Calling `setSearchParams`
  navigates. Its second argument takes `NavigateOptions` (`replace`, `preventScrollReset`).
  Without `replace` it pushes, which is what Decision 2 needs. Several calls in the same tick
  are not queued, so each update is done in one call.
- `e2e/property-journey.spec.ts:33-37` already applies a city filter in the real browser. A
  reload right after it proves AC3a end to end at almost no cost.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| Sort in the URL too, or only the filters? | Filters and sort | A reload or shared link restores the whole view. Keeping filters but resetting the sort would look inconsistent. | user |
| Push or replace on Apply / sort change? | Push | Back undoes the last change, like a submitted search form. | user |
| Invalid URL values | Ignore silently: the parse drops the bad value, the URL stays unchanged | Simplest. No effect and no extra navigation on load. | user |
| Param names | `city`, `state`, `zip`, `sort` with values `asc` / absent | Short and readable in a shared link. GraphQL enum names (`CREATED_AT_ASC`) would put an implementation detail in the URL. | research |
| Where values are trimmed and blanks dropped for the URL | In the serializer of the new module | The URL never shows `city=` or `city=++x`. The request rule in `useProperties.toFilter` stays the only request-side rule. | research |
| State case in the URL | Upper-cased before the `isStateCode` check (`state=az` → `AZ`) | A hand-typed lower-case link still works. It costs one call. | research |
| Repeated keys (`?city=a&city=b`) | First value wins (`URLSearchParams.get`) | Matches the browser default. No extra rule to test. | research |
| How the inputs follow the URL | The form is keyed by the filter part of the URL (`toListSearch({ filter, sort: 'CREATED_AT_DESC' }).toString()`) and uses `defaultValue` | Keeps the uncontrolled `FormData` submit. Back and reload both refill the inputs without an effect. A sort change does not remount the form, so unapplied text survives it, as today (plan review #2). | research |
| Apply when the URL would not change | Skip `setSearchParams` when `toListSearch(...).toString()` equals `searchParams.toString()` | Otherwise each such Apply pushes an identical history entry and Back seems to do nothing (plan review #3). One string comparison. | research |

## Design

New module `apps/web/src/lib/list-search.ts` (named after the existing `lib/` helpers). It
holds no React code:

- `parseListSearch(params: URLSearchParams): { filter: PropertiesFilter; sort: PropertySort }`
  - A zod object over `{ city, state, zip, sort }` read with `params.get`. Each field is parsed
    on its own (a per-field `.catch`), so one bad value drops only that field:
    - `city`: string of at most 100 characters, else `''`.
    - `state`: upper-cased, then kept only if `isStateCode`, else `''`.
    - `zip`: string of at most 5 characters, else `''`. Any characters are allowed; the API
      matches exactly, and the form has no digit pattern either.
    - `sort`: `'asc'` → `CREATED_AT_ASC`, anything else (or missing) → `CREATED_AT_DESC`.
  - Returns the same `PropertiesFilter` shape (`{ city, state, zipCode }`, all strings) that
    `useProperties` takes today.
- `toListSearch({ filter, sort }): URLSearchParams`
  - Sets `city`, `state`, `zip` only when the trimmed value is not blank (trimmed in the URL).
    Sets `sort=asc` only for `CREATED_AT_ASC`. The key order is fixed (`city`, `state`, `zip`,
    `sort`), so the form key and the URL stay stable.
- The round trip holds: `parseListSearch(toListSearch(state))` equals `state` with its values
  trimmed.

`ListPage` changes:

- `const [searchParams, setSearchParams] = useSearchParams()` and
  `const { filter, sort } = parseListSearch(searchParams)` replace the two `useState`s.
- Apply: `next = toListSearch({ filter: <form values>, sort })`; if
  `next.toString() !== searchParams.toString()`, `setSearchParams(next)`. Sort change:
  `setSearchParams(toListSearch({ filter, sort: <new> }))`. Both push (no `replace`).
- The filter `<form>` gets `key={toListSearch({ filter, sort: 'CREATED_AT_DESC' }).toString()}`
  (the filter part of the URL only), and each input or select gets `defaultValue` from
  `filter`. The sort `<select>` stays controlled by `sort`.
- The `filtered` flag for the empty-state wording is computed from the parsed `filter` as
  before.

No GraphQL, hook or API contract changes. Error model: there is none to add, because invalid
input is dropped by the parse and never reaches the request.

## Phases

### Phase 1: URL ↔ list state module

- Files:
  - `apps/web/src/lib/list-search.ts` (new): `parseListSearch` and `toListSearch` as in
    *Design*. Contract: `parseListSearch(params: URLSearchParams): { filter: PropertiesFilter;
    sort: PropertySort }`, `toListSearch(state): URLSearchParams`. Param names `city`, `state`,
    `zip`, `sort=asc`.
  - `apps/web/src/lib/list-search.test.ts` (new): a table of parse cases. Empty params give the
    defaults. Each valid field is read. Each field is dropped on its own when it is invalid,
    with the other fields valid (lesson "exactly one invalid field"): city 100 vs 101
    characters, zip 5 vs 6, `state=az` → `AZ`, `state=XX` → `''`, `sort=asc` / `sort=desc` /
    `sort=foo`, repeated key → first. Serialize cases: blank and whitespace-only values left
    out, values trimmed, default sort left out, fixed key order. One round-trip case.
  - `context/test-plan.md`: a new risk row TR-26 (AC3a: the URL is not written, is not read on
    load, or a bad value breaks the page), pointing to these tests and the Phase 2 tests. A new
    mutation-target row for `apps/web/src/lib/list-search.ts` with target 90%.
  - `context/roadmap.md`: commit the S-07 Overview row and the *Later* #9 note that are
    already in the working tree (`Refs #9`). Only the status flip to `done` is left for the
    final commit.
- Proves: the parse and serialize rules behind FR-11 AC3a (unit, Vitest `web` project).
- Agent checks: `pnpm typecheck`, `pnpm lint`,
  `pnpm vitest run --project web src/lib/list-search.test.ts`, `pnpm test:unit`.
- Human checks: none.

### Phase 2: ListPage reads and writes the URL

- Files:
  - `apps/web/src/pages/ListPage.tsx`: replace the `filter` / `sort` `useState`s with
    `useSearchParams` and `parseListSearch`. Apply and sort change call `setSearchParams` with
    `toListSearch(...)` (push); Apply skips the call when the URL would not change. Key the
    filter form by the filter part of the URL, and give the inputs `defaultValue`. Drop the "URL state is #9" comment. Contract: route `/` accepts
    `?city&state&zip&sort`.
  - `apps/web/src/pages/ListPage.test.tsx`: add a probe rendered inside the router that shows
    `location.search` and offers a Back button (`navigate(-1)`). New tests:
    - AC3a: Apply with city, state and zip writes `?city=…&state=…&zip=…` to the URL. A sort
      change adds `sort=asc` and keeps the filters.
    - AC3a: opening `/?city=fountain&state=AZ&zip=85268&sort=asc` fills the inputs and the sort
      select, and the first request carries those variables (a reload in the browser is the same
      as a first render at that route).
    - AC3a: after two Applies, Back restores the first filter in the inputs, in the last
      recorded request (`requests.at(-1)`) and in the rows. It does not check the exact request
      array, because Back refetches the stale cached key after a placeholder phase.
    - AC3a: Apply city A, Apply city A again, then Back: the URL is empty again (the repeated
      Apply pushed no entry).
    - AC3a: text typed in City but not applied survives a sort change (the form is not
      remounted).
    - AC3a: `/?state=XX&city=austin` shows "All states" and sends only the city filter (one
      invalid field, the other valid).
    - Changed: the AC6 test "a whitespace-only %s is a blank filter" (`:275-291`). After the
      whitespace Apply it asserts that the URL stays empty, that only one request was sent
      (`{ filter: {}, sort: 'CREATED_AT_DESC' }`), and that "No properties yet" shows and
      "No properties match the filters" does not.
    - The existing AC2 and AC3 tests, and the other AC6 tests, stay unchanged and still pass.
  - `e2e/property-journey.spec.ts`: after the city filter, reload the page. Assert that the URL
    has `city=Fountain+Hills`, the City input still holds the value, and the Scottsdale row is
    still absent.
  - `context/test-plan.md`: TR-26 → `covered (S-07)` with the test files.
  - `context/roadmap.md`: S-07 status → `done` happens in the final commit (`Closes #9`), as in
    earlier items.
- Proves: FR-11 AC3a (component level with Testing Library + MSW; end to end in Playwright),
  and FR-11 AC2 / AC3 still pass.
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --project web`,
  `pnpm test:unit`, `pnpm e2e` (Docker running).
- Human checks: in `pnpm dev` or `docker compose up`, set a filter and "Oldest first", reload,
  open the URL in a new tab, use browser Back and Forward. Check that the inputs and rows match
  the URL each time and that the URL reads cleanly.

## Risks and unknowns

- Remounting the form on every URL change drops focus after pressing Enter in the zip field.
  Accepted: the submit has finished, and the rows change anyway. Resolved.
- A blank Apply (only whitespace typed, or the same filters again) no longer re-fetches the
  list or adds a history entry. Today it re-fetches, because `'   '` is a new query key. The
  rows cannot differ (`toFilter` drops blank values anyway), so nothing visible is lost. The
  whitespace stays in the input, because the form key does not change. Accepted; the AC6 test
  is updated to pin it. Resolved.
- `keepPreviousData` keeps the old rows during Back, and an "Updating…" status shows. This is
  the same behaviour as a sort change today. Resolved.
- No `BLOCKING` unknowns.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: URL ↔ list state module (7aa6e44)
- [x] Phase 2: ListPage reads and writes the URL (1755e9f)

## Deviations
