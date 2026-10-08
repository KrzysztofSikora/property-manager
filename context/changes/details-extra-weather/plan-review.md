# Plan review: details-extra-weather

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Phasing / Grounding | The plan says "FR-12 AC1–AC4 regression (existing tests unchanged)" and lists only `property-details-delete.int.test.ts` among the API tests to update. Two other tests assert the whole `current` with `toEqual` and will fail. (a) `apps/api/test/integration/property-repository.int.test.ts:62-76` ("TR-16: maps the stored current to typed key fields…") compares the domain `weatherData` to an object with only the key fields and `raw`. The new domain fields from the sample break it. (b) `apps/api/test/operations.ts:2-26` is one shared `PropertyFields` fragment used by `CREATE_PROPERTY`, `PROPERTY` and `PROPERTIES`, not a "details operation". Adding the fields there changes the create response, so `create-property.int.test.ts:75-97` (`expect(rest).toEqual({… current: { …key fields, raw }})`) fails as well. | Add both files to Phase 1's file list with the typed sample values in their expected objects. Also say that the fragment is shared, so the create and list operations select the new fields too. Re-check `query-properties.int.test.ts` for whole-object asserts. |
| 2 | minor | Design | The domain contract is inconsistent. The `weather.ts` invariant says a bad field "becomes `undefined`", and *Design* says `astro`/`airQuality` are `undefined` "when every inner field is `null`". But the `weather.test.ts` bullet says `us-epa-index: "1.5"`, `""`, `"x"` "give `null`". In the domain, fields are `?: T`, and they become `null` only at the GraphQL layer. | Use `undefined` throughout for the domain and unit tests, and keep `null` for the GraphQL and web layers. |
| 3 | minor | Traceability | TR-16's existing unit test uses `toMatchObject` (`weather.test.ts:22`), so it would not notice an extra or wrong mapped field. The plan says only "the sample maps to every typed value". | State that the new sample test asserts the optional part with `toEqual`, e.g. the whole result minus `raw`, so an extra or misnamed key fails it. |
| 4 | minor | Grounding | The units "mb" / "mi" are unverified. context7 has no Weatherstack library, so this review could not confirm them either. The plan already marks them UNVERIFIED and lists a human check. | No change. Keep the human check before the commit, not after. |

## What is good

- Every cited source checks out: `schema.graphql:11-22`, `property.ts:4-13`, `weather.ts:24-36`,
  `property.repository.ts:19`, the fake at `property-repository.ts:34`, `response.ts:18` (reuse
  of `currentKeyFieldsSchema`), `codegen.ts:23`, `useProperty.ts:5`, `DetailsPage.test.tsx:60-91`,
  the sample's values and types, PRD FR-12 AC6 and the data-model names (`prd.md:282-284`, `369-375`),
  the mutation history (`create-property-with-weather/mutation.md:15`,
  `list-and-details-pages/mutation.md:19`). TR-28 is free (the last row is TR-27).
- It correctly keeps optional-field parsing out of `currentKeyFieldsSchema`, so a mistyped
  non-key field cannot fail a create (TR-03). The decimal regex is used instead of `z.coerce`,
  for the same `""` → 0 reason as `response.ts:6`.
- It keeps the AC1 `<dl>` and its `toEqual` test intact by putting the new groups in separate
  `<dl>`s. It guards `0` with a `!= null` test, and its AC5 `it.each` removes one group or field
  at a time, as lessons.md asks ("exactly one invalid field").
- The scope is tight: no adapter change, no migration, no e2e change, no time-zone conversion.
  Every decision has a reason, and nothing is left BLOCKING.
