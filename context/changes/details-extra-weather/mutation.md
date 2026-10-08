# Mutation check: details-extra-weather

Targets: `apps/api/src/domain/weather.ts` (whole file: key-field schema, lenient optional-field
mapper, `toCurrentWeather`) · `apps/web/src/lib/format.ts:11-25` (`epaIndexLabel` and its label
table)
Tests: `apps/api/vitest.unit.config.ts`, `apps/web/vitest.config.ts` (command runner,
`--concurrency 4`)
Score:
- `weather.ts`: 100% -> 100% (35 killed / 0 survived / 0 no coverage / 0 timeout)
- `format.ts:11-25`: baseline 100% (13 killed / 0 survived / 0 no coverage / 0 timeout). It was
  not a listed target when this ran; the review (R3) added it to *Mutation targets*.

Not mutated: `DetailsPage.tsx` (presentation; its `!= null` rows and hidden groups are covered
by the FR-12 AC5/AC6 tests), `useProperty.ts` (query text), the SDL, codegen output and fixtures.

Lessons applied: no timeouts at `--concurrency 4`, so the score does not rest on timeouts. The
earlier `weather.ts` run (`changes/create-property-with-weather/mutation.md`) had no
`strengthen` rows, so no earlier test needed re-checking.

## Mutants
No survivors and no uncovered mutants, so there is nothing to decide.

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| – | – | – | – | – |

Stryker makes no mutants for zod chain calls (`.optional().catch(undefined)`, `.pipe(z.int())`,
`z.int()` vs `z.number()`). The `OPTIONAL_FIELD_CASES` table guards them instead: each field is
mistyped one at a time, including fractions for `Int` fields and `"1.5"` for the EPA index. The
100% says nothing about these calls.

## Dead-weight tests
- `weather.test.ts` "TR-03: parses without astro, air_quality and other non-key fields" now
  repeats what the new tables check, and checks less. It asserts only `temperature`, while
  `OPTIONAL_FIELD_CASES` and the "astro / air_quality missing gives undefined" tables drop the
  same fields and assert the whole result with `toEqual`. Suggestion: fold it into those tables,
  e.g. one row with all four fields missing that asserts the whole object, and keep the TR-03
  label on it. Not changed here. Folded in by the review (R2).

## Gaps for the test plan
- `apps/web/src/lib/format.ts` `epaIndexLabel` is not in *Mutation targets*. Suggest a row: the
  label table and the 1–6 fallback (TR-28), baseline 100% (S-09). A shifted index would show the
  wrong health band. Added by the review (R3).
