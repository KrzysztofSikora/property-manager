# Plan: details-extra-weather (S-09)

## Goal and end state
The details page shows the extra weather data from the stored snapshot (FR-12 AC6, Should),
read from new typed `CurrentWeather` fields (roadmap "Later" #12):

- The `property` query exposes nullable `observationTime`, `weatherCode`, `windDegree`,
  `pressure`, `precip`, `cloudCover`, `uvIndex`, `visibility`, `isDay`, `astro { … }` and
  `airQuality { … }` on `CurrentWeather`, mapped from the stored `current`. A missing or
  mistyped field is `null`. It never fails a read or a create (PRD data model: non-key fields
  stay optional, OQ-03).
- `/properties/:id` shows observation time, pressure, precipitation (in), cloud cover (%), UV
  index, visibility, the astro values and the air-quality values when present (FR-12 AC6). Any
  missing field, or a whole missing group, is left out without errors (FR-12 AC5).
- FR-12 AC1–AC5 still pass unchanged.

Closes #11 (FR-12 AC6) and #12 (typed non-key `CurrentWeather` fields).

## Scope
- In:
  - SDL: optional scalar fields on `CurrentWeather` and new `Astro` / `AirQuality` types.
  - A tolerant optional-field mapper in `apps/api/src/domain/weather.ts`, plus codegen.
  - The details query, the page sections and an EPA-index label helper.
  - Test-plan rows TR-16, TR-20 and a new TR-28.
- Out:
  - Changing the adapter's response schema. The create still requires only the key fields.
  - A data migration (the snapshot is already stored whole).
  - Showing the extra fields on the list page.
  - Converting observation time to the viewer's time zone.
  - A label for the GB DEFRA index (shown as a number).
  - E2e changes (the smoke already covers the details page; the new fields are proven at unit
    and integration level).

## Findings
- `CurrentWeather` SDL has only the key fields plus `raw: JSON!` (`apps/api/schema.graphql:10-20`).
  The domain type matches (`apps/api/src/domain/property.ts:4-13`).
- `toCurrentWeather` (`apps/api/src/domain/weather.ts:24-36`) parses the key fields with
  `currentKeyFieldsSchema` (a `z.looseObject`) and keeps the rest only in `raw`. The repository
  calls it on every read (`apps/api/src/repositories/property.repository.ts:19`), and so does
  the in-memory fake (`apps/api/test/fakes/property-repository.ts:34`).
- The adapter reuses `currentKeyFieldsSchema` for the response (`adapters/weatherstack/response.ts:18`).
  Optional-field parsing must therefore live outside that schema, or a mistyped `pressure`
  would fail a create with `WEATHER_UNAVAILABLE`, which goes against TR-03 ("missing non-key
  fields → success").
- There are no codegen mappers. Resolvers return the domain object, so the default resolvers
  serve the new fields and `undefined` becomes `null` (`apps/api/src/graphql/resolvers.ts`, `codegen.ts`).
- Web codegen types `JSON` as `unknown` (`codegen.ts:23`). The details query does not fetch
  `raw` (`apps/web/src/hooks/useProperty.ts:5`).
- `DetailsPage.tsx` renders one `<dl>`. Its tests read every `<dt>`/`<dd>` pair through
  `details()` and assert the whole object with `toEqual` (`apps/web/src/pages/DetailsPage.test.tsx:63-91`).
  New `<dt>`s inside that same `<dl>` would break the AC1 test, so the new groups are separate
  `<dl>`s, and `details()` must be scoped to a group.
- Recorded sample (`docs/samples/weatherstack-current.json`):
  - `observation_time` is `"01:13 PM"` while `location.localtime` is `"2026-10-07 06:13"` with
    `utc_offset` `"-7.0"`, so the time is UTC and carries no date.
  - `air_quality` values are numeric strings with hyphenated keys (`"us-epa-index": "1"`).
  - `astro.moon_illumination` is an integer, and the other astro values are strings.
  - `is_day` is `"yes"`/`"no"`.
- Weatherstack's unit table for `units=f` gives °F, mph, pressure in **mb**, precipitation in
  **in**, visibility in **miles**. The docs site (docs.apilayer.com) renders client-side and
  could not be fetched in this session. Only "in" is confirmed, by the PRD (FR-12 AC6). "mb" and
  "mi" come from the Weatherstack units table as previously known and are UNVERIFIED (see Risks).
  Air-quality pollutants are in µg/m³.
- US EPA index scale: 1 Good, 2 Moderate, 3 Unhealthy for Sensitive Groups, 4 Unhealthy,
  5 Very Unhealthy, 6 Hazardous.
- Earlier mutation results: `weather.ts` scored 100% with no `strengthen` rows
  (`changes/create-property-with-weather/mutation.md:15`), so no earlier test needs re-checking
  (lessons.md, "moves a rule's input"). `DetailsPage.tsx` and `format.ts` were skipped as targets
  (`changes/list-and-details-pages/mutation.md:19`).

## Decisions
| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| Where does the page get the extra fields? | Typed SDL fields, delivering #12 in this change | The API owns the snake_case mapping. The web gets codegen types, and there is no second mapping when #12 lands. | user |
| How much air quality to show? | All 8 values; the US EPA index with its label, e.g. "1 (Good)" | AC6 says "airQuality values". A bare index number means little to a reader. | user |
| Observation time display | As stored plus " UTC", e.g. "01:13 PM UTC" | The sample proves UTC, and there is no date to convert safely. | user |
| Phases | One phase, one commit | The item is small. | user |
| Mistyped or missing optional field | `null`, field by field. A bad `pressure` does not hide `precip`. | PRD: non-key fields are optional (OQ-03). A read must never fail on them. | research (PRD data model) |
| Air-quality value types | Pollutants `Float`, indexes `Int`, parsed from numeric strings with the same decimal regex as `lat`/`lon`; anything else → `null` | "Typed" per #12. `z.coerce` would turn `""` into 0 (`response.ts:6`). | research |
| GraphQL names | camelCase per PRD (`cloudCover`, `uvIndex`, `isDay`, `moonPhase`, `usEpaIndex`, `gbDefraIndex`). `pm2_5` and `pm10` keep their names. | PRD data model lists these names. `pm2_5` is a valid GraphQL name, and `pm25` would read as a different metric. | research (PRD) |
| `isDay` | `Boolean` from "yes"/"no", any other value → `null`. Not shown on the page. | PRD data model. AC6 does not list it. | research (PRD) |
| `weatherCode`, `windDegree` | Typed in the API, not shown on the page | AC6 does not list them. The page already shows wind direction. | research (PRD) |
| Page layout | Three extra `<dl>` groups under `h2` headings "Weather details", "Astronomy", "Air quality". A group with no values is left out. | Keeps the AC1 `<dl>` and its test unchanged, and gives the groups clear names. | research (existing tests) |
| GB DEFRA index | Number only | Its 1–10 bands add a second label table for little value. | planner default |

## Design

**SDL** (`apps/api/schema.graphql`): every new field is nullable.
- `CurrentWeather`: `observationTime: String` ("hh:mm AM/PM", UTC), `weatherCode: Int`,
  `windDegree: Int`, `pressure: Int` (mb), `precip: Float` (in), `cloudCover: Int` (%),
  `uvIndex: Int`, `visibility: Int` (mi), `isDay: Boolean`, `astro: Astro`,
  `airQuality: AirQuality`. Update the type description, since `raw` is no longer the only way
  to reach the non-key fields.
- `type Astro { sunrise: String, sunset: String, moonrise: String, moonset: String, moonPhase: String, moonIllumination: Int }`.
- `type AirQuality { co: Float, no2: Float, o3: Float, so2: Float, pm2_5: Float, pm10: Float, usEpaIndex: Int, gbDefraIndex: Int }`.
- `precip` is `Float`. Weatherstack sends `0` in the sample, but inches can be fractional. The
  others are `Int`, as in the sample. A non-integer value for an `Int` field → `null`.

**Domain** (`apps/api/src/domain/property.ts`, `weather.ts`):
- `CurrentWeather` gains the optional fields as `?: T` and `Astro` / `AirQuality` types whose
  fields are all optional.
- A new `toOptionalWeather(raw)` (name can be adjusted in `/implement`) parses each field on its
  own (`schema.safeParse` per key, or `.optional().catch(undefined)` per field). One bad value
  then drops only that field: it becomes `undefined` in the domain, which GraphQL serializes as
  `null`. `astro` / `airQuality` are `undefined` when absent or not an
  object. They are also `undefined` when every inner field is `null`, so the page hides the
  group.
- `toCurrentWeather` spreads it in. `currentKeyFieldsSchema` is unchanged, so the adapter and
  create are unaffected.
- Error model: none. This mapper never throws.

**Web**:
- `useProperty.ts`: the query requests the new fields. Run `pnpm codegen`.
- `lib/format.ts`: `epaIndexLabel(index: number): string` returns "1 (Good)" … "6 (Hazardous)",
  and the bare number for any value outside 1–6.
- `DetailsPage.tsx`: under the existing `<dl>`, up to three `<section>` groups, each with an
  `h2` and its own `<dl>`. Rows are rendered only when the value is not `null`.
  - Weather details: Observed "01:13 PM UTC", Pressure "1010 mb", Precipitation "0 in",
    Cloud cover "0 %", UV index "0", Visibility "6 mi". `0` must render, so the check is
    `!= null`, not truthiness.
  - Astronomy: Sunrise, Sunset, Moonrise, Moonset, Moon phase, Moon illumination "15 %".
  - Air quality: CO, NO₂, O₃, SO₂, PM2.5, PM10 in "µg/m³", US EPA index "1 (Good)", GB DEFRA
    index "1".
  - Extract a small local `Row` component, or a row list per group, so each row is not
    hand-written three times.
- `test/fixtures.ts`: `propertyFixture` gets the new fields from the recorded sample, with
  `PropertyFixture` widened to match. Update the comment that says `raw` is left out.

## Phases
### Phase 1: Typed extra weather fields on the API and the details page
- Files:
  - `apps/api/schema.graphql`: the new nullable fields plus the `Astro` and `AirQuality` types.
    Contract: `CurrentWeather` as in *Design*.
  - `apps/api/src/graphql/generated/resolvers-types.ts`, `apps/web/src/graphql/*`: regenerated
    by `pnpm codegen` and committed.
  - `apps/api/src/domain/property.ts`: optional fields on `CurrentWeather`, plus `Astro` and
    `AirQuality`. Contract: the domain type matches the SDL.
  - `apps/api/src/domain/weather.ts`: tolerant optional-field parsing merged into
    `toCurrentWeather`. Invariant: the result for the sample deep-equals the expected typed
    values, a mistyped or missing optional field becomes `undefined` on its own, and the
    function never throws because of an optional field.
  - `apps/api/src/domain/weather.test.ts`:
    - A new sample test asserts the optional typed fields with `toEqual`, not `toMatchObject`,
      so an extra or misnamed field fails it. It covers strings → numbers for air quality and
      "yes"/"no" → boolean. The existing TR-16 test uses `toMatchObject` and would miss both.
    - An `it.each` table removes or mistypes one optional field at a time, with all others valid
      (lessons.md), and asserts only that field is `undefined`.
    - An absent `astro` / `air_quality`, or one that is not an object, gives `undefined`.
    - `us-epa-index: "1.5"`, `""` and `"x"` give `undefined` (regex anchors).
    - The key-field tests stay as they are.
    - Null vs undefined: the domain and its unit tests use `undefined`. GraphQL serializes it as
      `null`, so integration and web tests use `null`.
  - `apps/api/test/operations.ts`: there is no separate details operation. `PROPERTY_FIELDS`
    is one fragment shared by `CREATE_PROPERTY`, `PROPERTY` and `PROPERTIES`. Add the new fields
    to it, so every API integration test now selects them.
  - `apps/api/test/integration/property-details-delete.int.test.ts`: in FR-04 AC1, the expected
    object includes the typed fields of the stored sample. Add one case where a stored snapshot
    has no `astro` / `air_quality` / `pressure`, so `property(id)` returns those as `null`
    without errors.
  - `apps/api/test/integration/create-property.int.test.ts:75`: the FR-05 AC1 `toEqual` on the
    whole create response gets the typed fields too, because the fragment is shared.
  - `apps/api/test/integration/property-repository.int.test.ts:62`: the TR-16 `toEqual` on
    `created.weatherData` gets the domain's typed fields. This is a domain object, so absent
    fields are left out rather than set to `null`.
  - `apps/api/test/integration/query-properties.int.test.ts:104` was checked: it uses
    `toMatchObject` on `weatherData`, so it needs no change.
  - `apps/web/src/hooks/useProperty.ts`: the query adds the fields, and the `raw` comment is
    updated.
  - `apps/web/src/lib/format.ts` and `format.test.ts`: `epaIndexLabel` with a table for 1–6 and
    for 0 and 7 (fallback to the number).
  - `apps/web/src/test/fixtures.ts`: the sample's extra fields.
  - `apps/web/src/pages/DetailsPage.tsx`: the three groups as in *Design*.
  - `apps/web/src/pages/DetailsPage.test.tsx`: `details()` scoped to a container (e.g. `within`
    the group's `region`/`section` by heading), and the AC1 test scoped to the first `<dl>` so
    its expected object stays as it is.
    - New "FR-12 AC6" test: each group's `<dt>`→`<dd>` map equals the expected strings with
      units.
    - Extend AC5: an `it.each` removes one group (`astro: null`, `airQuality: null`) and one
      scalar (`pressure: null`) at a time. The group heading or row is absent and the rest
      still renders.
    - One case with `uvIndex: 0` and `precip: 0` shows "0" (guards the `!= null` check).
  - `context/test-plan.md`: TR-16 adds the typed optional fields. TR-20 drops "`astro` /
    `air_quality` live only in `raw`". New TR-28 for FR-12 AC6 (tests above). The mutation-target
    row for `domain/weather.ts` mentions the optional-field mapper.
  - `context/roadmap.md`: S-09 status `done` at the end, done by `/implement`.
- Proves: FR-12 AC6 (web unit, Testing Library + MSW), FR-12 AC5 for the new fields (web
  unit), the #12 typed fields (API unit table + api-int through GraphQL), FR-12 AC1–AC4
  regression (existing tests unchanged).
- Agent checks: `pnpm codegen` (no drift afterwards), `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test:unit`, `pnpm vitest run --project api-int`, `pnpm test`.
  Afterwards `/mutation` runs on `apps/api/src/domain/weather.ts`.
- Human checks:
  - `docker compose up --build`, then open a property's details page. Confirm the three groups
    read well, the units look right ("mb", "mi", "in", "µg/m³") and "01:13 PM UTC" is clear.
  - In GraphiQL, `property(id)` returns the typed fields.
  - **Before the commit:** confirm "mb" and "mi" against the Weatherstack docs in a browser
    (see Risks). If either is wrong, fix the labels and tests first.
- Commit: one Conventional Commit, `feat(details): show extra weather fields` with
  `Closes #11` and `Closes #12`.

## Risks and unknowns
- Pressure and visibility units under `units=f` (mb, mi): UNVERIFIED in this session, because the
  docs site did not render, and context7 has no Weatherstack docs (plan review). Not blocking,
  since it only affects two unit labels. The human check resolves it, and it must be done
  before the commit. If it is wrong, change the label strings and the test expectations.
- `PROPERTY_FIELDS` in `apps/api/test/operations.ts` is shared by every API operation, so
  adding fields changes every whole-object assertion on a property. Phase 1 lists the two
  `toEqual` checks this affects (plan review).
- Weatherstack may send non-key fields as `null`, or with other types than in the one sample
  (OQ-03). The per-field tolerant parsing turns those into `null` and does not fail the read.
- Rows created before this change already hold the full `current`, so no backfill is needed.
- The e2e smoke asserts only "82 °F", so the new groups do not change it.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [ ] Phase 1: Typed extra weather fields on the API and the details page

## Deviations
- Phase 1, small and local: the sample's optional typed values are one shared
  `SAMPLE_OPTIONAL_WEATHER` in `apps/api/test/fixtures/weatherstack.ts` (not in the file list),
  used by `weather.test.ts` and the three API integration tests instead of four copies.
- Phase 1, small and local: `DetailsPage.test.tsx` also covers a group whose fields are all `null`
  (left out) and `moonIllumination: 0` (shown), next to the planned `uvIndex` / `precip` zero case.
- Follow-up (not done, outside the phase): `weather.ts` has its own `decimalString`, the same as
  the one in `adapters/weatherstack/response.ts`. Sharing it would touch the adapter.
