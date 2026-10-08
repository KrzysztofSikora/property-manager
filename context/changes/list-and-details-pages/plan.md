# Plan: list-and-details-pages (S-04)

## Goal and end state

The web app shows the stored properties and lets the user delete them (issue #6). When S-04 is
done:

- FR-11 AC1: `/` shows a table of every matching property (no `limit`) with street, city, state,
  zip code and creation date, newest first.
- FR-11 AC2: a sort control switches to "Oldest first". The list is re-fetched with
  `sort: CREATED_AT_ASC` and re-ordered.
- FR-11 AC3: a filter form (city text, state select, zip text) applied on submit shows only the
  matching properties.
- FR-11 AC5: each row has a Delete button that opens a native `<dialog>`. Confirm sends
  `deleteProperty`, and the row disappears after `['properties']` is invalidated. Cancel sends
  nothing.
- FR-11 AC6: loading indicator; empty state (no properties, or no matches) with a link to
  `/properties/new`; error state with a Retry button that re-requests.
- FR-11 AC7: each row links to `/properties/:id`.
- FR-12 AC1: `/properties/:id` shows the full address, `lat`/`long`, creation date,
  temperature and feels-like (°F), description and icon, wind speed (mph) and direction,
  humidity (%).
- FR-12 AC2: the page says that the coordinates are those of the town Weatherstack resolved,
  not the building, and that the weather is as of creation time.
- FR-12 AC3: an unknown (or malformed) id shows "Property not found" with a link to the list.
- FR-12 AC4: delete with confirmation returns the user to `/`.
- FR-12 AC5: a snapshot with no description or icon (empty arrays) renders without errors and
  leaves those parts out.
- NFR-09 for both views: explicit loading, empty and error states. On the list page a failed
  delete shows a message in the dialog, with a specific one for `PROPERTY_NOT_FOUND`. On the
  details page `PROPERTY_NOT_FOUND` navigates to `/` instead (the property is gone either way).
- After a delete from the details page, the deleted property's `Property` query is not
  re-fetched, so "Property not found" never flashes.
- Test-plan row TR-20 is `covered`.

## Scope

- In:
  - Web dependencies: `@property-manager/shared` (`workspace:*`), and
    `@testing-library/user-event` as a dev dependency (the Cookbook assumes it; it is not
    installed).
  - Test setup: a `<dialog>` polyfill, `TZ=UTC`, property fixtures, and default MSW handlers for
    `Properties` / `Property`.
  - GraphQL documents `Properties`, `Property`, `DeleteProperty`, and the committed codegen
    output.
  - Hooks `useProperties`, `useProperty`, `useDeleteProperty`, and the components `ListPage`,
    `DetailsPage` and `DeletePropertyDialog`.
  - `lib/format.ts` (date formatting) and `lib/graphql-errors.ts` (reads the error code).
  - The `ApiStatus` component and the web `Health` document are removed.
  - The production `QueryClient` (`main.tsx`) turns query retries off.
  - Test-plan updates: TR-20 status and the Cookbook web notes (default handlers, dialog
    polyfill, TZ).
- Out:
  - Filters and sort in the URL (FR-11 AC3a, #9), UI pagination (FR-11 AC4, #10), non-key
    weather fields and `raw` on the details page (FR-12 AC6, #11).
  - The create form and the full per-code error message table (S-05, TR-19). S-04 adds only the
    code reader and the two delete messages.
  - E2E (S-06).
  - API changes. The SDL from S-03 is enough.

## Findings

Repo state (`3ecbed6`):

- `apps/web/src/pages/ListPage.tsx`, `DetailsPage.tsx`, `CreatePage.tsx`: placeholders with an
  `<h1>` only. `apps/web/src/app/routes.tsx:10-16` already has the routes `/`,
  `properties/new`, `properties/:id` and `*` under `Layout`.
- `apps/web/src/app/routes.test.tsx:9-16`: the heading table expects `Property abc-123` for the
  details route, and `:18-22` asserts "API: ok". Both change: the details route now shows a
  loading state and then not-found, and `ApiStatus` is removed.
- `apps/web/src/components/ApiStatus.tsx:5`: "Placeholder until S-04". `Layout.tsx:2,14` renders
  it.
- `apps/web/src/main.tsx:13`: `new QueryClient()` with defaults, so queries retry 3 times with
  backoff (about 7 s before an error shows). `ApiStatus.tsx:12-13` set `retry: false` for that
  reason; tests already use `retry: false` (`test/render.tsx:7`).
- `apps/api/src/graphql/properties-args.ts:12`: each filter value is capped at 100 characters
  (`BAD_USER_INPUT`). Stored zip codes are exactly 5 digits (`packages/shared/src/address.ts:34`).
- `apps/web/src/lib/execute.ts`: `execute(document, variables)` throws `GraphQLRequestError`
  with `status` and `errors[]` (each with `extensions`). It is a mutation target with a 97.4%
  baseline (F-01). S-04 does not change it, so S-04 has no `/mutation` step.
- `apps/web/src/test/msw.ts:6-9`: `api = graphql.link('/graphql')`. The only default handler is
  `Health`. `setup.ts:7` sets `onUnhandledFrame: 'error'`, so every rendered page needs a handler
  for its operations.
- `apps/web/src/test/render.tsx`: `renderWithProviders(ui, { route })` wraps `ui` in
  `MemoryRouter`. A page that navigates (FR-12 AC4) must be rendered through `<AppRoutes />` so
  that the target route exists.
- `apps/web/package.json`: no `@property-manager/shared` and no `@testing-library/user-event`.
  `apps/api` already uses `"@property-manager/shared": "workspace:*"`. `tsconfig.base.json` has
  `allowImportingTsExtensions`, so the shared `.ts` specifiers type-check in the web
  (`moduleResolution: bundler`), and Vite resolves them.
- `packages/shared/src/index.ts`: exports `US_STATES` (code → name, 50 + DC), `stateName`,
  `ERROR_CODES`, `ErrorCode`.
- `apps/api/schema.graphql`: `properties(filter, sort, limit, offset): PropertyPage!`,
  `property(id): Property` (null for unknown or malformed), `deleteProperty(id): ID!`
  (`PROPERTY_NOT_FOUND`). `CurrentWeather` key fields are all non-null, and
  `weatherDescriptions` / `weatherIcons` are non-null lists that may be empty. `createdAt` is a
  `DateTime`, which web codegen types as `string`.
- `codegen.ts`: the web client preset scans `apps/web/src/**/*.{ts,tsx}`, with
  `documentMode: 'string'` and `enumsAsTypes`. `PropertySort` becomes a string union.
- `eslint.config.ts:45-48`: web files get `react-hooks` recommended rules. There is no layer
  rule for the web.
- `context/tech-stack.md:166-171`: pages → hooks (TanStack Query) → `execute()`; filters in
  `useSearchParams`. The roadmap moved URL filters to #9 (Should), so S-04 keeps them in
  component state.

Library facts:

- jsdom 30.1.2 (`lib/jsdom/living/nodes/HTMLDialogElement-impl.js` is an empty class): there is
  no `showModal()` or `close()`, only the reflected `open` attribute. Checked in Node:
  `typeof dialog.showModal === 'undefined'`. The test setup polyfills both.
- TanStack Query 5 (context7 `/tanstack/query`): `placeholderData: keepPreviousData` keeps the
  old rows while a new key loads (`isPlaceholderData` is true meanwhile).
  `invalidateQueries({ queryKey: ['properties'] })` matches by prefix.
  `useMutation`'s own `onSuccess` runs, and is awaited, before the `mutate(vars, { onSuccess })`
  callback, so a prefix invalidation in the hook refetches an active detail query before the
  page can remove it or navigate. Query filters accept `exact` and
  `type: 'active' | 'inactive' | 'all'` (`removeQueries`, `invalidateQueries`).
- `@testing-library/user-event` latest is 14.6.7 (`pnpm view`).

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How do filters apply? | A `<form>` with an "Apply" submit button (Enter submits). The query re-runs on submit, not while typing. | One request per apply, and tests need no fake timers. | user |
| State filter control | `<select>` labelled "State", with "All states" plus 50 + DC from `US_STATES` (`CODE – Name`). | Only valid codes can be sent. S-05 needs the shared dependency anyway. | user |
| Delete failure | The dialog stays open and shows a message: for `PROPERTY_NOT_FOUND`, "This property no longer exists" (the list is invalidated); for anything else, a generic "Could not delete the property, try again". Exception: on the details page `PROPERTY_NOT_FOUND` navigates to `/` straight away, so no message is shown there and no test expects one. | The user sees why. A row that is already gone does not linger, and a details page for a gone property has nothing left to show. | user (details-page exception: plan review) |
| `ApiStatus` header line | Removed, together with the web `Health` document. The API `health` query stays. | It was a placeholder until S-04. The page error states now cover an unreachable API. | user |
| Date display | `Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })` in the viewer's time zone. Web tests run with `TZ=UTC`. | A local single-user app. Pinning TZ keeps assertions stable. | user |
| Filter and sort state | Component state (`useState`), not the URL. | FR-11 AC3a is Should (#9). | roadmap |
| Phase split | (1) list page, (2) delete from the list, (3) details page. | Agreed with the user. | user |
| Query keys | `['properties', 'list', { filter, sort }]` and `['properties', 'detail', id]`. | Hierarchical keys as in the tech stack. | research |
| What a delete invalidates | `invalidateQueries({ queryKey: ['properties', 'list'] })`, plus `removeQueries({ queryKey: ['properties', 'detail', id], exact: true, type: 'inactive' })`. The active detail query of the deleted id is left alone. | The hook's `onSuccess` runs before the page's, so invalidating the whole `['properties']` prefix would refetch the open details page into "Property not found" before it navigates. A delete changes no other property's details. The inactive removal drops a stale cached details entry after a delete from the list. | plan review |
| Query retries | The production `QueryClient` sets `defaultOptions.queries.retry: false`. Mutations already default to no retry. | The error state's Retry button is the retry. With the default 3 retries the error state appears only after about 7 s, which `ApiStatus` avoided the same way. | plan review |
| Overlong filter values | City input `maxLength={100}`, Zip input `maxLength={5}`. No separate error path. | The API rejects values over 100 characters, and the generic error's Retry could never succeed. Stored zips are 5 digits, so a longer zip can never match. | plan review |
| Which fields each page asks for | List: `items { id street city state zipCode createdAt } totalCount`. Details: every `Property` field and the seven `CurrentWeather` key fields, not `raw`. | Each page asks for what it shows. `raw` is for #11. | research |
| What "missing optional fields" means for FR-12 AC5 in S-04 | Every key field is non-null in the SDL, and `astro` / `air_quality` live only in `raw`, which S-04 does not query. The fields that can be missing are the description and the icon (empty lists). They are left out when empty. | That is the only absence the shown fields can have. AC5 is proven with that fixture. | research |
| Row → details (FR-11 AC7) | The street cell is a `<Link>` to `/properties/:id`. There is no `onClick` on the `<tr>`. | A link is keyboard- and screen-reader-accessible, and Testing Library finds it by role. | research |
| Dialog lifetime | `DeletePropertyDialog` is mounted only while a property is selected. On mount it calls `showModal()`, and its `close` event (Cancel, Esc, or after success) calls `onClose`, which unmounts it. | In jsdom a closed `<dialog>` may still count as present, so "mounted = open" makes `queryByRole('dialog')` reliable. | research |
| Reading error codes | `lib/graphql-errors.ts` exports `errorCode(error: unknown): ErrorCode \| undefined`, which narrows a `GraphQLRequestError` and checks `extensions.code` against `ERROR_CODES`. S-05 adds the message table to the same module (TR-19). | One place that reads the code. It does not anticipate S-05's messages. | research |
| Loading indicator during re-fetch | `keepPreviousData` keeps the table visible during a sort or filter re-fetch, and an "Updating…" status shows while `isPlaceholderData`. The first load shows "Loading properties…". | No flash of the loading state on every apply. | research |

## Design

### Data flow

```
ListPage / DetailsPage → hooks (TanStack Query) → execute(document, vars) → POST /graphql
```

Documents are declared with `graphql(...)` in the hook files, and codegen generates their types.

### Hooks (`apps/web/src/hooks/`)

- `useProperties({ filter, sort })`: `useQuery` with key `['properties', 'list', { filter,
  sort }]` and `placeholderData: keepPreviousData`. Sends `Properties($filter, $sort)`, never
  `limit`. Blank filter values are dropped before the request.
- `useProperty(id)`: `useQuery` with key `['properties', 'detail', id]`. Sends `Property($id)`,
  and `data.property` is `null` for not found.
- `useDeleteProperty()`: `useMutation` with `DeleteProperty($id)`. On success and on
  `PROPERTY_NOT_FOUND` it invalidates `['properties', 'list']` and removes the deleted id's
  detail query only if it is inactive (see *Decisions*). It never refetches the deleted id's
  active detail query. The caller handles navigation.

### Components

- `ListPage` (`/`): `<h1>Properties</h1>`; the filter form (City text with `maxLength={100}`,
  State select, Zip text with `maxLength={5}`, Apply); the Sort select ("Newest first" = `CREATED_AT_DESC`, "Oldest first" =
  `CREATED_AT_ASC`), which re-queries on change; `totalCount` ("3 properties").
  - States: first load → `role="status"` "Loading properties…". Error → `role="alert"` "Could
    not load properties" with a Retry button (`refetch()`). Empty → "No properties yet" (no
    filters) or "No properties match the filters", both with a link "Add a property" →
    `/properties/new`.
  - Table columns: Street (link), City, State, Zip code, Created, plus an action column with a
    "Delete" button whose accessible name includes the street (`aria-label="Delete <street>"`).
- `DeletePropertyDialog({ property, onClose, onDeleted })`: native `<dialog>` with the
  `aria-labelledby` heading "Delete property?", the address, and Cancel / Delete buttons. While
  the mutation is pending, Delete is disabled. Error messages appear in `role="alert"` inside
  the dialog.
- `DetailsPage` (`/properties/:id`):
  - Loading → `role="status"`. Error → alert with Retry. `null` → `<h1>Property not
    found</h1>` and a link "Back to properties".
  - Found → `<h1>` is the street. A `<dl>` holds: Address (`street, city, state zip`),
    Coordinates (`lat, long`), Created (formatted), Temperature (`72 °F`), Feels like (`70 °F`),
    Conditions (the first description, with the first icon as `<img alt="{description}">`,
    each left out when its list is empty), Wind (`8 mph NW`), Humidity (`40 %`).
  - The FR-12 AC2 note sits under Coordinates / Weather: "Coordinates are those of the town
    Weatherstack resolved the address to, not of the building. Weather is as of when the
    property was created."
  - A Delete button opens `DeletePropertyDialog`. `onDeleted` and `PROPERTY_NOT_FOUND` both
    navigate to `/` with no message (see *Decisions*). The hook does not refetch this page's
    query, so "Property not found" does not flash before the navigation. After unmount the
    detail query is inactive and garbage-collected as usual.

### Libraries (`apps/web/src/lib/`)

- `format.ts`: `formatDateTime(iso: string): string` (en-US, medium date, short time, viewer TZ).
- `graphql-errors.ts`: `errorCode(error: unknown): ErrorCode | undefined`.

### Test support (`apps/web/src/test/`)

- `setup.ts`: if `HTMLDialogElement.prototype.showModal` is missing, define `showModal()` (sets
  `open`) and `close(returnValue?)` (removes `open`, sets `returnValue`, dispatches `close`).
  `TZ` is pinned to `UTC` (see *Risks*).
- `fixtures.ts`: `propertyFixture(overrides)` for a full `Property` with key weather fields
  (Fountain Hills, AZ, 85268, a fixed `createdAt`), and `listItem(overrides)`.
- `msw.ts`: default handlers. `Properties` returns `{ items: [], totalCount: 0 }`, and
  `Property` returns `null`. `Health` is removed. Tests override with `server.use(...)` and
  record request variables inside the handler.

## Phases

### Phase 1: List page

- Files:
  - `apps/web/package.json`, `pnpm-lock.yaml`: add `@property-manager/shared: workspace:*` and
    the dev dependency `@testing-library/user-event`.
  - `apps/web/src/test/setup.ts`: dialog polyfill and TZ pin. Contract: `showModal` / `close`
    exist in jsdom, and `close` fires a `close` event.
  - `apps/web/src/test/fixtures.ts` (new): `propertyFixture`, `listItem`.
  - `apps/web/src/test/msw.ts`: default `Properties` / `Property` handlers instead of `Health`.
  - `apps/web/src/components/ApiStatus.tsx`, `ApiStatus.test.tsx`: deleted.
    `apps/web/src/app/Layout.tsx`: no `ApiStatus`.
  - `apps/web/src/main.tsx`: `new QueryClient({ defaultOptions: { queries: { retry: false } } })`.
  - `apps/web/src/lib/format.ts` (new) and `format.test.ts`: `formatDateTime`.
  - `apps/web/src/hooks/useProperties.ts` (new): the `Properties` document and the hook.
    Contract: query key `['properties', 'list', { filter, sort }]`, no `limit` sent.
  - `apps/web/src/pages/ListPage.tsx`: table, sort, filter form, loading / empty / error
    states, row links. `ListPage.test.tsx` (new).
  - `apps/web/src/app/routes.test.tsx`: drop the "API: ok" test. The details route row expects
    "Property not found" (default `Property` → `null`).
  - `apps/web/src/graphql/*`: regenerated (`pnpm codegen`).
  - `context/test-plan.md`: Cookbook web notes (default handlers, `fixtures.ts`, dialog
    polyfill, TZ).
- Proves (unit, Testing Library + MSW, `ListPage.test.tsx`):
  - FR-11 AC1: three items render street, city, state, zip and formatted date in the order the
    API returned, and the request has `sort: CREATED_AT_DESC` and no `limit`.
  - FR-11 AC2: choosing "Oldest first" sends `CREATED_AT_ASC`, and the rows re-order to the
    new response.
  - FR-11 AC3: filling City, choosing a State and filling Zip, then Apply, sends exactly those
    filter values (blank ones left out), and the table shows the filtered response. City has
    `maxLength` 100 and Zip has `maxLength` 5.
  - FR-11 AC6: a delayed handler shows the loading status. An empty result shows the empty
    state with an "Add a property" link to `/properties/new`, with the filter wording when
    filters are set. A network error shows the alert, and Retry sends a second request and
    then shows rows.
  - FR-11 AC7: clicking the street link (rendered through `AppRoutes`) opens the details
    route for that id.
- Agent checks: `pnpm codegen` (no drift after commit), `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm vitest run --project web`, `pnpm test:unit`.
- Human checks: `pnpm dev` with a few created properties: the table, sort and filters look
  right and the dates read in local time. With the API stopped, the error state appears at
  once (no retry delay), and Retry works once the API is back.

### Phase 2: Delete from the list

- Files:
  - `apps/web/src/lib/graphql-errors.ts` (new) and `graphql-errors.test.ts`. Contract:
    `errorCode(error: unknown): ErrorCode | undefined`. It returns the code only for a
    `GraphQLRequestError` whose first error's `extensions.code` is in `ERROR_CODES`.
  - `apps/web/src/hooks/useDeleteProperty.ts` (new): the `DeleteProperty` document and the
    mutation. On success and on `PROPERTY_NOT_FOUND` it invalidates `['properties', 'list']`
    and removes the deleted id's detail query only when inactive.
  - `apps/web/src/components/DeletePropertyDialog.tsx` (new) and its test: native `<dialog>`,
    mounted = open.
  - `apps/web/src/pages/ListPage.tsx`: a Delete button per row, which opens the dialog.
    `ListPage.test.tsx`: the AC5 cases.
  - `apps/web/src/graphql/*`: regenerated.
- Proves (unit, Testing Library + MSW):
  - FR-11 AC5: confirm sends `DeleteProperty` with that id, the dialog closes, `Properties` is
    requested again, and the row is gone. Cancel closes the dialog and MSW records no
    `DeleteProperty`.
  - Delete failure: `PROPERTY_NOT_FOUND` shows "no longer exists" and the list re-fetches. A
    network error shows the generic message, keeps the dialog open and does not re-fetch.
    Tests assert the message and the recorded requests, not only that an alert exists (lesson
    "Assert an error's cause or code").
  - `errorCode` table: a known code, an unknown code string, no extensions, and a non-
    `GraphQLRequestError` value.
- Agent checks: `pnpm codegen`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm test:unit`.
- Human checks: in a real browser, the dialog is modal (backdrop, focus inside), Esc closes it
  without deleting, and the row disappears after confirming.

### Phase 3: Details page

- Files:
  - `apps/web/src/hooks/useProperty.ts` (new): the `Property` document (every field except
    `raw`) and the hook. Contract: key `['properties', 'detail', id]`, and `null` means not
    found.
  - `apps/web/src/pages/DetailsPage.tsx`: the found / not-found / loading / error states, the
    FR-12 AC2 note, and delete through `DeletePropertyDialog` with navigation to `/`.
    `DetailsPage.test.tsx` (new), rendered through `AppRoutes`.
  - `apps/web/src/graphql/*`: regenerated.
  - `context/test-plan.md`: TR-20 → `covered (S-04)`, with the test files named. Its approach
    text changes from "a snapshot without `astro` / `air_quality` renders" to "a snapshot with
    empty description and icon lists renders without them", noting that `astro` /
    `air_quality` live only in `raw`, which the details page shows from #11.
- Proves (unit, Testing Library + MSW):
  - FR-12 AC1: every field is shown with its unit (`°F`, `mph` with direction, `%`), plus the
    coordinates, the formatted date and the icon `img` with the description as `alt`.
  - FR-12 AC2: the town-level coordinate note and the "as of creation" wording are present.
  - FR-12 AC3: `property: null` shows "Property not found" and a link to `/`.
  - FR-12 AC4: confirming delete sends `DeleteProperty`, and the list page heading appears.
    `PROPERTY_NOT_FOUND` on delete also lands on the list, with no dialog message. In both
    cases MSW records exactly one `Property` request (no refetch of the deleted id), and
    "Property not found" never appears (`queryByRole('heading', { name: 'Property not found' })`
    stays null across the transition).
  - FR-12 AC5: a fixture with `weatherDescriptions: []` and `weatherIcons: []` renders the
    other fields, with no `img` and no Conditions entry.
  - NFR-09: a delayed handler shows the loading status, and a network error shows the alert
    with a Retry that re-requests.
- Agent checks: `pnpm codegen`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm test:unit`;
  `grep -rn "FR-11 AC\|FR-12 AC" apps/web/src` lists every Must AC.
- Human checks: `pnpm dev`: open a real property and check the icon loads, the units and
  wording read well, the precision note is clear, and delete returns to the list.

## Risks and unknowns

- TZ pin (resolved in phase 1): Node re-reads `process.env.TZ` when it is assigned, but
  Vitest's `test.env` and a `setup.ts` assignment run at different times relative to the first
  `Date`/`Intl` use. Phase 1 picks the one that a test with a non-midnight UTC time proves
  stable. Fallback: set `TZ=UTC` in the web `test:unit` script and the root Vitest project
  config.
- The dialog polyfill can hide real-browser behaviour (focus trap, Esc → `cancel`). That is
  covered by the phase 2 human check here, and by the e2e smoke in S-06.
- Weatherstack icon URLs are external (`https`). Tests do not load images, and the `alt` text
  is asserted. Not blocking.
- Unknowns: none `BLOCKING`.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [ ] Phase 1: List page
- [ ] Phase 2: Delete from the list
- [ ] Phase 3: Details page

## Deviations

- Phase 1, `routes.test.tsx`: plan says the details row expects "Property not found"; the
  details page is still the phase 1 placeholder (`Property <id>`), so the row stays until
  phase 3. Only the "API: ok" test is dropped now.
- Phase 1, FR-11 AC7: plan says click through `AppRoutes`; the test renders `ListPage` with a
  probe `/properties/:id` route instead, so it does not depend on the details page, which
  phase 3 rewrites. It asserts the id that reached the route.
- Phase 1, `apps/web/src/lib/execute.test.ts` (not in the plan's file list): it used the removed
  `HealthDocument`. It now uses `PropertiesDocument` with the same cases. `execute.ts` is
  unchanged.
- Phase 1, TZ pin: `test.env: { TZ: 'UTC' }` in `apps/web/vitest.config.ts` holds (the
  `format.test.ts` case at 23:42 UTC checks the resolved zone and the formatted day/hour).
  No fallback needed.
- Follow-up (not fixed, outside the phase): `execute(doc, {})` does not type-check for a
  document whose variables are all optional. TS infers `TVariables` from `{}`, which matches
  the no-variables branch of the rest type. Callers pass a non-empty object today.
