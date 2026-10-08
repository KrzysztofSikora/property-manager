# Plan: ui-polish (S-11)

## Goal and end state

The web UI looks like the reviewed sketch (`context/changes/ui-polish/sketch.html`) instead of
a bare skeleton, with no change in behaviour, API contract or runtime dependencies (#25).

Observably true when done:

- Every view sits in a shared shell: app bar with brand, a "Properties" nav link and a
  "New property" primary button, on a tinted ground, with content in cards. Colours, radii and
  breakpoints come from Tailwind 4 `@theme` tokens (light palette only).
- List (FR-11): filters and sort in one aligned bar inside the card; street over city in one
  cell; state chip; a "Weather at creation" column (icon, temperature, description); delete is
  a quiet icon button still named `Delete <street>`. Loading, empty and error states (NFR-09,
  FR-11 AC6) restyled.
- Details (FR-12): breadcrumb; weather hero (temperature, icon, condition, feels-like and
  observation time, six reading tiles); Location panel with the town-level note (AC2); Air
  quality card with a coloured US EPA badge, Sun and moon card with a sunrise–sunset bar,
  Precipitation card; a page footnote that the weather is as of creation (AC2). Every AC1 and
  AC6 value is still shown with its unit, and AC5 omission rules still hold per tile, row and
  card.
- Create (FR-13): the form in a card, field and form messages restyled; AC1 – AC4 behaviour
  unchanged.
- Every FR-11, FR-12, FR-13 and NFR-09 test passes. Tests change only where they read layout
  (cell contents, group names, the AC1 `<dl>`), never to weaken an assertion on a value, role or
  accessible name. Every view works from 1280 px to 400 px without horizontal page scroll.

## Scope

- In:
  - `apps/web` only: `index.css` tokens, `Layout`, `ListPage`, `DetailsPage`, `CreatePage`,
    `NotFoundPage`, `DeletePropertyDialog`, a new inline-SVG icon module, one new pure helper
    (`epaIndexTone`) in `lib/format.ts`.
  - The list query asks for three more existing fields (`weatherData.current.temperature`,
    `weatherDescriptions`, `weatherIcons`); `pnpm codegen` output committed.
  - Test updates in `apps/web/src/**/*.test.tsx`, `test/fixtures.ts`, and two places in
    `e2e/property-journey.spec.ts` (details assertions, the "Properties" link locator).
- Out:
  - Dark mode (D-3), webfonts (system stack), new runtime dependencies, an icon library.
  - Any API, schema, shared-package or behaviour change; no new FR or AC.
  - Temperature colouring warm/cool from the sketch (D-7).
  - The sketch's "Showing 1–6 of 6" footer text and always-visible pager (D-8).
  - Mutation testing: no new target (roadmap: "No mutation targets").

## Findings

Current state:

- `apps/web/src/index.css:1` is only `@import 'tailwindcss';`: no theme tokens, no base styles.
- `apps/web/src/app/Layout.tsx:3-19`: a `max-w-4xl` column with two plain `Link`s
  ("Properties", "New property") and no `aria-label` on the `<nav>`.
- `apps/web/src/pages/ListPage.tsx:70-139`: filters form and the Sort select sit in a flex row;
  `:156-201` the table has columns Street, City, State, Zip code, Created, Actions and a
  bordered red "Delete" text button with `aria-label="Delete <street>"`; `:202-233` the
  pagination `<nav aria-label="Pagination">` shows only when `totalCount > PAGE_SIZE`.
- `apps/web/src/hooks/useProperties.ts:6-21`: the list query asks for id, street, city, state,
  zipCode, createdAt. The query document changes; `toFilter` (the Stryker target logic) does
  not.
- `apps/web/src/pages/DetailsPage.tsx:119-151`: one AC1 `<dl>` (Address, Coordinates, Created,
  Temperature, Feels like, Conditions, Wind, Humidity), then `:153-188` three `DetailsGroup`
  sections ("Weather details", "Astronomy", "Air quality") that drop `null` rows and empty
  groups (rule at `:22-25`), then `:190-193` one `<p>` holding both AC2 sentences.
- `apps/web/src/components/DeletePropertyDialog.tsx:84-122`: native `<dialog>`, Cancel and
  Delete buttons with ad-hoc classes.
- Tests that read layout and must change:
  - `ListPage.test.tsx:151-154` `rowStreets()` reads cell 0's `textContent`, which will also
    hold the city; `:164-174` asserts the six cell texts of a row, including `'Delete'` (the
    icon button will have no text) and separate City cell; `:175` columnheader "Zip code".
  - `DetailsPage.test.tsx:69-74` `keyDetails()` reads the first `<dl>` on the page; `:77-79`
    `group(name)` reads a region by its `h2`; `:117-152` AC1/AC2 assert one `<dl>` and one
    paragraph with both sentences; `:280-292` asserts the h2 list
    `['Weather details', 'Astronomy', 'Air quality']`; `:304-363` AC5 cases name those
    groups and count 2 regions.
  - `e2e/property-journey.spec.ts:19-21` matches `'82 °F'`, `'Clear'` and
    `'33.609, -111.729'` exactly; `:28` clicks `getByRole('link', { name: 'Properties',
    exact: true })` on the details page, which becomes ambiguous once the breadcrumb adds a
    second "Properties" link (Playwright strict mode would fail).
- Unaffected selectors: create form labels (`getByLabel('Street')` etc. in `e2e/helpers.ts:23-27`,
  `create-errors.spec.ts:17-20`), dialog name "Delete property?", button names "Apply",
  "Retry", "Delete", "Create property", "Previous", "Next", status/alert roles, h1 names
  checked by `routes.test.tsx`.
- Mutation history (lesson "Re-check earlier mutation-strengthened tests when a change moves a
  rule's input"): no Stryker target's input moves. `useProperties.ts` keeps `toFilter` and the
  variables; `format.ts` `epaIndexLabel` is unchanged and its `format.test.ts` table stays.
  `ListPage.tsx` and `DetailsPage.tsx` are not targets.
- `context/test-plan.md:71` keeps visual styling out of automated tests; the 1280 / 400 px
  check is a human check (with Playwright MCP screenshots as evidence).

Library facts:

- Tailwind 4 `@theme` (tailwindcss.com docs, "Theme variables", via context7): `--color-<name>`
  creates `bg-/text-/border-<name>`, `--radius-<name>` creates `rounded-<name>`,
  `--breakpoint-<name>` creates a `<name>:` variant; redefining `--breakpoint-sm` overrides the
  default. Default `--font-sans` is the system UI stack and `--font-mono` is `ui-monospace, …`,
  so `font-sans` / `font-mono` already match the "system fonts + monospace for data" rule
  without new font tokens. Arbitrary `max-[…]:` variants also exist but named tokens are used.
- React Router 8 `NavLink` (reactrouter.com API docs via context7): sets `aria-current="page"`
  when active, `className` accepts `({ isActive }) => string`, `end` limits the match to the
  exact path.

## Decisions

| Question | Answer | Why | Decided by |
|---|---|---|---|
| D-1 How closely does the details page follow the sketch? | Follow it: hero with six tiles, Location panel, Air quality / Sun and moon / Precipitation cards, page footnote. DetailsPage tests are rewritten per section with every AC1/AC5/AC6 value kept; two e2e lines change. | The sketch is the reviewed reference; keeping the old groups would keep the long-column feel the item exists to fix. Layout renames this implies (values and units unchanged): region "Astronomy" → "Sun and moon"; label "Moon illumination" → "Illumination"; the "US EPA index" row → the Air quality badge (D-9); "Weather details" split into hero tiles and the "Precipitation" card; AC1 `<dl>` "Coordinates" → Location "Latitude" / "Longitude". Rewritten tests are checked against this list. | user |
| D-2 What do narrow screens (< 560 px) do with the 6-column list? | Hide the "Weather at creation" and "Created" columns with CSS below the `sm` breakpoint; Address, State, Zip code and Delete stay. Below `sm` the creation date moves into the Address cell as a muted third line (`sm:hidden`), so every row still shows it. | No horizontal scroll at all. FR-11 AC1 (Must) requires the creation date on every row at every supported width (400 px, roadmap); weather is not in AC1, so it may stay on the details page only. Amended after plan-review finding 1. | user (amended per plan review) |
| D-3 Dark mode? | Light palette only. | One palette to build and check by eye; the app has no dark mode today. | user |
| D-4 Breakpoints | Override `--breakpoint-sm: 35rem` (560 px) and `--breakpoint-md: 51.25rem` (820 px) in `@theme`; styles are mobile-first (`sm:` = ≥ 560 px, `md:` = ≥ 820 px). | Sketch says follow its 820 / 560 px breakpoints closely; overriding the default names keeps the familiar utilities. No current class uses `sm:` / `md:`. | research |
| D-5 Column headers | Address, State, Zip code, Weather at creation, Created, plus an `sr-only` "Actions". | Sketch shows "Zip" and "Added"; "Zip code" and "Created" match the PRD (FR-11 AC1 "creation date"), the filter labels, and the existing columnheader assertion. | research (PRD) |
| D-6 List weather icon | `<img src={weatherIcons[0]} alt="">` (decorative) next to the temperature and description text; cell left empty of the icon / description when the arrays are empty. | The description is already in the cell, so a non-empty alt would read twice. The sketch's inline SVG icons are a sketch-only stand-in (sketch header). Details keeps `alt={description}` as today (FR-12 AC1 test). | research |
| D-7 Warm/cool temperature colour | Not ported; temperatures use the ink colour. | It would introduce an unspecified 70 °F threshold rule; not listed among the "follow closely" parts. | research |
| D-8 List footer | Keep today's rules: the count line ("N properties", plus "· Updating…") sits under the page heading; the pager footer shows only when `totalCount > PAGE_SIZE`, with "Page X of Y" between Previous and Next. No "Showing a–b of n". | The S-08 bound tests pin these rules and texts; a range label adds untested arithmetic. | research (S-08 tests) |
| D-9 EPA badge colours | `epaIndexTone(index)` in `lib/format.ts`: 1 → `good`, 2 – 3 → `fair`, 4 – 6 → `poor`, anything else → `neutral`. Badge text `US EPA ${epaIndexLabel(i)}` (e.g. "US EPA 1 (Good)"). | Sketch defines good and fair styles only; poor reuses the danger tokens. Reusing `epaIndexLabel` leaves the mutation-tested label table untouched. | research |
| D-10 Where the AC2 sentences go | Coordinates sentence (verbatim) in the Location panel; "Weather is as of when the property was created. It is not refreshed." as a page footnote under the cards, not inside an omittable card. | AC2 must hold even when the Precipitation card is left out (AC5). Wording keeps "created" (PRD) rather than the sketch's "added". | research |
| D-11 Two "Properties" links on details (nav + breadcrumb) | App-bar nav gets `aria-label="Main"`, breadcrumb is `<nav aria-label="Breadcrumb">`. e2e scopes the click to the Main navigation. | Keeps the sketch's breadcrumb label; the locator change is a layout one. | research |
| D-12 Nav active state | "Properties" is a `NavLink` with `end`, active (and `aria-current="page"`) on `/` only. | No custom matcher; the breadcrumb already orients the details page. | research |
| D-13 Duplicates shown in the sketch (cloud cover in a tile and in Precipitation; observed time in the hero line and in Precipitation) | Kept as in the sketch. | Reviewed layout; each section is asserted on its own region, so duplicates do not make tests ambiguous. | research |

## Design

### Tokens (`apps/web/src/index.css`)

`@theme` with the sketch's light values as `--color-ground`, `surface`, `ink`, `muted`, `line`,
`accent`, `accent-soft`, `danger`, `danger-soft`, `good`, `good-soft`, `fair`, `fair-soft`,
`sun`; `--radius-card: 10px`, `--radius-control: 8px`; the two breakpoints (D-4). A
`@layer base` rule gives `body` the ground background, ink text, 15 px / 1.5 type, and a global
`:focus-visible` outline in the accent colour; `prefers-reduced-motion` disables the row-hover
transition. Default Tailwind colours stay available.

### Icons (`apps/web/src/components/icons.tsx`)

Small components returning inline SVG paths copied from the sketch: `HouseIcon` (brand),
`PlusIcon`, `TrashIcon`. Each renders `aria-hidden="true"` and `focusable="false"`, takes an
optional `className`. No dependency.

### Shell (`Layout.tsx`)

`<header>` full-width surface bar; inner 1080 px column: brand (house mark + "Property
Manager", text hidden below `sm`), `<nav aria-label="Main">` with the "Properties" `NavLink`,
spacer, `Link` "New property" styled as the primary button with `PlusIcon`. `<main>` is the
1080 px page column with the sketch's padding and 20 px vertical gap. Accessible names stay
"Properties" and "New property".

### List (`ListPage.tsx`, `useProperties.ts`)

- Page head: h1 "Properties", sub line with the count element (exact text "N properties" /
  "1 property", D-8) and a separate sentence "Weather is the snapshot taken when each one was
  created." (the sketch says "added"; "created" matches the PRD).
- Card: filter `<form>` as the top bar (City, State, Zip code fields with small uppercase
  labels above 38 px controls; Apply ghost button aligned to the inputs; Sort pushed right at
  ≥ `md`). Labels keep wrapping their controls (or `htmlFor`), so names "City", "State",
  "Zip code", "Sort" are unchanged.
- Table: Address cell = `Link` street (accessible name = street) with the city on a second
  line and, below `sm` only (`sm:hidden`), the muted creation date as a third line (D-2); State chip; Zip code in `font-mono`; Weather cell = icon (D-6), "82 °F" bold,
  description muted; Created muted; Delete = 32 px icon button, `aria-label="Delete <street>"`,
  `title="Delete"`, `TrashIcon`, red on hover/focus. Weather and Created `th`/`td` get
  `hidden sm:table-cell` (D-2). Rows highlight on hover.
- Pager footer inside the card under the table, same `<nav aria-label="Pagination">`, same
  disabled / `aria-disabled` logic, "Page X of Y".
- Loading, empty and error states render inside the card body: `role="status"` text, empty
  message + "Add a property" link, `role="alert"` with Retry. Texts unchanged.
- Query adds `weatherData { current { temperature weatherDescriptions weatherIcons } }` to
  each item. Contract: `PropertiesQuery['properties']['items'][number]` gains `weatherData`.

### Details (`DetailsPage.tsx`, `lib/format.ts`)

- Head: `<nav aria-label="Breadcrumb">` "Properties" link / "City, ST"; h1 street; sub line
  "City, ST zip · created <formatDateTime>"; Delete button (danger ghost, `TrashIcon` +
  "Delete", name "Delete") top right; same dialog wiring.
- Hero card (two columns at ≥ `md`, stacked below):
  - `<section aria-label="Current weather">`: icon `img` (`alt={description ?? 'Weather icon'}`,
    left out when no icon), temperature element whose text is "82 °F" (the unit in a smaller
    span, with the space inside it so `textContent` stays "82 °F"), condition text (left out
    when no description), sub line "Feels like 79 °F · observed 01:13 PM UTC" (observed part
    left out when `null`), and a `<dl>` of tiles Wind ("6 mph NE"), Humidity ("34 %"), Cloud
    cover, UV index, Pressure, Visibility; a `null` tile is left out. Tiles grid 3 columns,
    2 below `sm`.
  - `<section aria-labelledby>` h2 "Location": `<dl>` Street, City, State (chip), Zip code,
    Latitude, Longitude (mono), then the coordinates sentence (D-10).
- Cards grid (3 columns at ≥ `md`, 1 below): each a `<section aria-labelledby>` with an h2,
  reusing the current `DetailsGroup` rule (null rows dropped, empty card left out):
  - "Air quality": rows PM2.5, PM10, O₃, NO₂, SO₂, CO, GB DEFRA index; when `usEpaIndex` is not
    `null`, a badge with tone from `epaIndexTone` (D-9), placed as a sibling of the `<h2>` inside a
    flex header (never inside the `<h2>`, so the heading text stays "Air quality"). The
    region's accessible name is "Air quality" only (`aria-labelledby` points at the `<h2>`).
    The card shows when any row or the badge has a value.
  - "Sun and moon": rows Sunrise, Sunset, Moonrise, Moonset, Moon phase, Illumination; the
    sunrise–sunset bar (decorative, `aria-hidden`) only when both times are present.
  - "Precipitation": rows Precipitation, Cloud cover, Observed (D-13).
- Footnote under the cards (D-10).
- `epaIndexTone(index: number): 'good' | 'fair' | 'poor' | 'neutral'` added beside
  `epaIndexLabel`; badge classes map from the tone in the page.

### Create, not-found, dialog

- `CreatePage`: h1 "New property" + sub line; form inside a card (max ~28rem), labels in the
  list-filter style above 38 px inputs, `aria-invalid` red border and red message below,
  form-level `role="alert"` as a danger-soft box, primary submit button. Ids,
  `aria-describedby`, focus logic and texts unchanged.
- `NotFoundPage` and the details "Property not found" state: card with h1 and the existing
  "Back to properties" link styled as a ghost button.
- `DeletePropertyDialog`: card-styled dialog (radius-card, surface), Cancel ghost button,
  Delete solid danger button; texts and behaviour unchanged.

## Phases

### Phase 1: Theme tokens and app shell

- Files:
  - `apps/web/src/index.css`: `@theme` tokens, base layer, breakpoints. Contract: utilities
    `bg-ground`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`,
    `bg-accent-soft`, `text-danger`, `bg-danger-soft`, `good/fair` pairs, `rounded-card`,
    `rounded-control`, `sm:` = 560 px, `md:` = 820 px.
  - `apps/web/src/components/icons.tsx` (new): `HouseIcon`, `PlusIcon`, `TrashIcon`.
    Contract: decorative (`aria-hidden`), optional `className`.
  - `apps/web/src/app/Layout.tsx`: app bar and page column. Contract: `navigation` "Main"
    holding link "Properties" (`aria-current="page"` on `/`); link "New property" outside it.
  - `apps/web/src/components/DeletePropertyDialog.tsx`: classes only.
  - `apps/web/src/pages/NotFoundPage.tsx`: card + ghost-button link; texts unchanged.
  - `apps/web/src/app/routes.test.tsx`: add a case: on `/` the Main navigation has link
    "Properties" with `aria-current="page"`, and link "New property" goes to
    `/properties/new`; on `/properties/new` "Properties" has no `aria-current`.
- Proves: shell links by role and name (component level); FR-11 AC5, FR-12 AC3/AC4 and NFR-09
  through the unchanged dialog, list and details tests.
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm --filter @property-manager/web build`, `pnpm e2e`
  (the journey's line-28 click goes through the rewritten nav; it stays unambiguous until the
  breadcrumb arrives, so the D-11 locator change remains in Phase 3).
- Human checks: app bar, ground, dialog and not-found page against the sketch at 1280 px and
  400 px (brand text hidden, no horizontal scroll).

### Phase 2: List page

- Files:
  - `apps/web/src/hooks/useProperties.ts`: query asks for the three weather fields. Contract:
    list item type gains `weatherData.current.{temperature, weatherDescriptions,
    weatherIcons}`; variables and `toFilter` unchanged.
  - `apps/web/src/graphql/*`: `pnpm codegen` output.
  - `apps/web/src/test/fixtures.ts`: `listItem` copies those three fields from
    `propertyFixture`.
  - `apps/web/src/pages/ListPage.tsx`: layout per *Design / List*. Contract: names "City",
    "State", "Zip code", "Sort", "Apply", "Retry", `Delete <street>`, "Previous", "Next",
    "Pagination", texts "N properties", "Page X of Y", "No properties yet", "No properties
    match the filters", "Add a property", "Loading properties…", "Could not load properties",
    "Updating…" unchanged.
  - `apps/web/src/pages/ListPage.test.tsx`:
    - `rowStreets()` reads the street link's text in each body row instead of cell 0.
    - FR-11 AC1 case asserts the row's cells as `['1 Oldest RdBostonSep 14, 2026, 11:42 PM', 'MA',
      '02108', '82 °FClear', 'Sep 14, 2026, 11:42 PM', '']` (or per-cell checks of street link, city
      line, narrow-screen date line, state, zip, weather, date) and the column headers Address, State, Zip code,
      Weather at creation, Created.
    - New case: a row whose `weatherDescriptions` and `weatherIcons` are empty shows the
      temperature and no icon or description, the rest of the row intact.
    - New assertion in AC1: the weather icon has the fixture's `src` and empty alt, found with
      `within(weatherCell).getByRole('presentation')` (an `<img alt="">` has no `img` role).
- Proves: FR-11 AC1 (with the weather column), AC2 – AC7, AC3a, AC4, AC6 through
  `ListPage.test.tsx` (component level); TR-24 through `pnpm e2e`.
- Agent checks: `pnpm codegen` then `git diff --stat` and `git diff apps/web/src/graphql`
  show only the intended change (the three list fields), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm e2e`.
- Human checks: list at 1280 px against the sketch (aligned filter bar, chip, weather column,
  quiet delete icon turning red on hover and focus); at 400 px Weather and Created columns hidden,
  the creation date shown under the city in each row, and no horizontal scroll; empty, error (stop the API) and loading states.

### Phase 3: Details page

- Files:
  - `apps/web/src/lib/format.ts`: `epaIndexTone(index: number): 'good' | 'fair' | 'poor' |
    'neutral'` (D-9). `epaIndexLabel` untouched.
  - `apps/web/src/lib/format.test.ts`: table for `epaIndexTone`: 0, 1, 2, 3, 4, 6, 7.
  - `apps/web/src/pages/DetailsPage.tsx`: layout per *Design / Details*. Contract: h1 =
    street; regions "Current weather", "Location", "Air quality", "Sun and moon",
    "Precipitation"; button "Delete"; breadcrumb navigation "Breadcrumb" with link
    "Properties"; img name = description; not-found and error texts unchanged.
  - `apps/web/src/pages/DetailsPage.test.tsx`: replace `keyDetails()` / `group()` with a
    per-region `<dt>` → `<dd>` helper and rewrite cases, keeping each assertion:
    - AC1: sub line has "Fountain Hills, AZ 85268" and "Sep 14, 2026, 3:42 PM"; Current
      weather region has the temperature element with `toHaveTextContent('82 °F')` (the unit
      sits in a nested span, so the default `getByText` would not match), "Clear", "Feels like 79 °F" and tiles Wind "6 mph NE",
      Humidity "34 %"; img "Clear" with the fixture `src`; Location region =
      `{ Street, City, State: 'AZ', 'Zip code': '85268', Latitude: '33.609',
      Longitude: '-111.729' }`.
    - AC2: the coordinates sentence inside the Location region; the "as of when the property
      was created" footnote present.
    - AC5: empty description and icon lists → no img, no condition text, tiles intact;
      `astro: null` → no "Sun and moon" region, others present (4 regions);
      `airQuality: null` → no "Air quality" region; every pollutant and DEFRA `null`
      with `usEpaIndex: 1` → "Air quality" region with only the badge; `usEpaIndex: null` with
      rows present → region with rows and no badge; `pressure: null` → no Pressure tile, other
      tiles and cards intact; all Precipitation fields `null` → no "Precipitation" region,
      while hero tiles that are not `null` still show.
    - AC6: tiles Cloud cover "0 %", UV index "0", Pressure "1010 mb", Visibility "6 mi";
      Precipitation region `{ Precipitation: '0 in', 'Cloud cover': '0 %',
      Observed: '01:13 PM UTC' }`; Sun and moon region (with "Illumination: 15 %"); Air
      quality region rows with µg/m³ units and "GB DEFRA index: 1"; badge text
      "US EPA 1 (Good)"; zero values shown (`uvIndex`, `precip`, `moonIllumination` 0).
    - h2 list: `['Location', 'Air quality', 'Sun and moon', 'Precipitation']` when all present.
    - Delete, not-found, loading, error/retry cases unchanged apart from selectors that read
      the old layout.
  - `e2e/property-journey.spec.ts`: lines 19-21 assert "82 °F" and "Clear" as now, and
    Latitude "33.609" / Longitude "-111.729" in the Location region instead of the combined
    string; line 28 clicks "Properties" inside `getByRole('navigation', { name: 'Main' })`
    (D-11).
- Proves: FR-12 AC1 – AC6 (component level, MSW), TR-28 (`epaIndexTone` table, AC6 values),
  TR-24 (`pnpm e2e`).
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm e2e`.
- Human checks: details at 1280 px against the sketch (hero, tiles, Location panel, three
  cards, badge colour, sun bar); at 820 px and 400 px the hero stacks, cards stack, tiles go
  to 2 columns, no horizontal scroll; a stored property without `astro` / `airQuality` (if
  one exists locally) lays out without gaps.

### Phase 4: Create page and responsive pass

- Files:
  - `apps/web/src/pages/CreatePage.tsx`: layout per *Design / Create*. Contract: labels
    "Street", "City", "State", "Zip code", button "Create property" / "Creating…", alert and
    field-message texts, ids, `aria-invalid`, `aria-describedby` and focus behaviour
    unchanged.
  - Any class fix-ups in Phase 1 – 3 files found by the responsive pass (classes only).
- Proves: FR-13 AC1 – AC4 and TR-19 / TR-21 through the unchanged `CreatePage.test.tsx` and
  `e2e/create-errors.spec.ts`.
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`,
  `pnpm e2e`; Playwright MCP screenshots of `/`, a details page, `/properties/new` (with
  validation errors shown by submitting the empty form, no create sent) and a not-found URL at
  1280, 820 and 400 px against the running stack, checking `document.documentElement
  .scrollWidth <= innerWidth` on each.
- Human checks: the screenshots and the live app against the sketch; wording of the new sub
  lines and footnote.

## Risks and unknowns

- Resolved: test churn on DetailsPage is accepted (D-1); review checks the rewritten cases
  against the AC list above so no value or omission rule is lost.
- Resolved: Playwright strict mode on two "Properties" links (D-11).
- Risk: `getByText('82 °F', { exact: true })` in e2e depends on the temperature element's text
  being exactly "82 °F" with the unit in a nested span; Phase 3 keeps the space inside the
  span, and `pnpm e2e` proves it.
- Risk: Weatherstack icon URLs load from a third-party CDN in every list row (already true on
  details). No new request to Weatherstack itself; e2e uses the stub's sample URL.
- Risk: visual drift from the sketch is only caught by human checks (test-plan out of scope
  for styling); Phase 4's screenshots are the evidence.
- No `BLOCKING` unknowns.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Theme tokens and app shell (35c67e6)
- [ ] Phase 2: List page
- [ ] Phase 3: Details page
- [ ] Phase 4: Create page and responsive pass

## Deviations

- Phase 2, list table at < 560 px. Plan: Weather and Created hidden, so the table fits.
  Code: with `whitespace-nowrap` cells a long street plus chip, zip and Delete is wider than
  400 px. Consequence: the Address cell wraps below `sm`, cell padding drops to 12 px below
  `sm`, and the table sits in an `overflow-x-auto` wrapper (as in the sketch), so the page
  itself never scrolls sideways.
