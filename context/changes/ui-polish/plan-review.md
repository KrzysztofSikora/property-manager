# Plan review: ui-polish

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Traceability / Scope | D-2 hides the "Created" column below `sm` ("Hide the "Weather at creation" and "Created" columns with CSS below the `sm` breakpoint"). FR-11 AC1 (Must, `context/prd.md:252-253`) says the list "shows street, city, state, zip code and creation date for each", and the roadmap requires the views to work down to 400 px (`context/roadmap.md:258`). At 400 px the creation date is gone, which contradicts the plan's own "no change in behaviour". jsdom ignores the CSS, so no test notices. | Keep the date visible on narrow screens, e.g. a muted third line in the Address cell with `sm:hidden` (hide only the Weather column), or have the user record the AC1 narrowing at < 560 px in *Decisions* as an accepted deviation. |
| 2 | minor | Grounding / Phasing | Testing Library's default `getByText` matches an element's own text nodes only. The hero temperature is planned as "82 °F" with "the unit in a smaller span", so `getByText('82 °F')` will not match it in `DetailsPage.test.tsx`, even though Playwright's `getByText` (e2e:19) will. The plan says only that the region "has text "82 °F"". | Say how the component test asserts it, e.g. `toHaveTextContent('82 °F')` on the temperature element, or a function matcher on `textContent`. |
| 3 | minor | Grounding | D-6 uses `alt=""` for the list icon. An `<img alt="">` has role `presentation`, not `img`, so the planned assertion "the weather icon `img` has the fixture's `src` and empty alt" cannot use `getByRole('img')`. | Note the query: `within(row).getByRole('presentation')`, or a `querySelector('img')` on the cell. |
| 4 | minor | Failure paths / AC5 | The Air quality card has a new omission rule, "The card shows when any row or the badge has a value". That differs from the `DetailsGroup` rule (`DetailsPage.tsx:22-25`, rows only). No planned case covers `airQuality` with only `usEpaIndex` set, or with only `usEpaIndex` null. | Add one AC5 case: every pollutant and DEFRA null with `usEpaIndex: 1` shows the card with only the badge; optionally the reverse (no badge, rows present). |
| 5 | minor | Design | The Air quality region puts "a badge in the h2 row", and the h2 list assertion expects `'Air quality'` as that heading's `textContent`. If the badge is placed inside the `<h2>`, the text becomes "Air qualityUS EPA 1 (Good)" and the test fails. | State that the badge is a sibling of the `<h2>` inside a flex header, not a child of it. |
| 6 | minor | Traceability | Labels change without a decision row: "Moon illumination" becomes "Illumination" (plan AC6 vs `DetailsPage.test.tsx` `ASTRONOMY`, `DetailsPage.tsx:173`), "Astronomy" becomes "Sun and moon", and the "US EPA index" row becomes a badge. These are fine as layout changes, but the plan's rule is "never to weaken an assertion on a value, role or accessible name". | Add one line under D-1 that lists the renamed labels and regions, so the review can check the rewritten tests against it. |
| 7 | minor | Grounding | `DetailsPage.tsx:122-212` is cited, but the file has 207 lines. The AC1 `<dl>` is at `:119-151`, the three groups at `:153-188` and the AC2 `<p>` at `:190-193`. | Fix the line references. |
| 8 | minor | Phasing | Phase 1 rewrites the `<nav>` that e2e line 28 clicks through, but its agent checks do not include `pnpm e2e`. In Phase 2, "`git status --porcelain apps/web/src/graphql` shows only the intended diff" lists file names, not a diff. | Add `pnpm e2e` to Phase 1, or say why it can wait until Phase 2. Use `git diff --stat` plus `git diff apps/web/src/graphql` for the codegen check. |

## What is good

- The findings are accurate. Every test line that reads layout was found: `rowStreets()` at
  `ListPage.test.tsx:151-154`, the six-cell assertion at `:164-174`, `keyDetails()` / `group()`,
  the h2 list, the region count, and e2e lines 19-21 and 28.
- The region count is right: Current weather, Location and the three cards make 5, so 4
  without `astro`.
- The breadcrumb catch is good: a second "Properties" link would break Playwright strict mode.
  D-11 fixes it with a named `navigation`.
- The data is safe: `PropertyPage.items` is `[Property!]!` with `weatherData: WeatherData!`
  (`apps/api/schema.graphql:85,112`). The repository list does `select()` on every column
  (`property.repository.ts:99`), so the three list fields need no API change.
- `listItem`'s type comes from the query (`fixtures.ts:104`), so the planned fixture change is
  required and the plan includes it.
- D-10 puts the AC2 weather sentence outside any omittable card. D-9 reuses
  `epaIndexLabel`, so its mutation-tested table stays untouched, which follows the lesson on
  rule inputs moving.
- Tailwind 4 claims spot-checked with context7 (`tailwindcss.com` theme docs):
  `--breakpoint-*`, `--color-*` and `--radius-*` in `@theme` create the variants and utilities
  the plan names. Default breakpoints can be overridden.
- The scope is tight: no new dependencies, dark mode left out (D-3), the sketch-only colour
  rule left out (D-7) and the range label left out (D-8). The visual checks are correctly
  human checks per `test-plan.md:71`.
