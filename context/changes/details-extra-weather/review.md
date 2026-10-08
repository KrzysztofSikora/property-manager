# Review: details-extra-weather

Verdict: APPROVE
Gates: typecheck ok, lint ok (format:check ok), tests 688 passed / 0 failed (`pnpm test`, 40 files, Testcontainers included)

Base: `812d49f` (parent of `9f766f3`, the only `(details-extra-weather)` commit), plus the
uncommitted Progress tick in `plan.md` and the untracked `mutation.md`.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/api/schema.graphql` | done | Nullable fields, `Astro`, `AirQuality`, and an updated `CurrentWeather` description, as in *Design*. |
| `apps/api/src/graphql/generated/resolvers-types.ts` | done | Regenerated, and `pnpm codegen` shows no drift (implement run). |
| `apps/web/src/graphql/gql.ts`, `graphql.ts` | done | Regenerated. |
| `apps/api/src/domain/property.ts` | done | Optional fields plus `Astro` / `AirQuality`, matching the SDL. |
| `apps/api/src/domain/weather.ts` | done | `lenient()` per field and `nonEmpty()` per group. `currentKeyFieldsSchema` is unchanged, so the adapter and create are not affected. |
| `apps/api/src/domain/weather.test.ts` | done | `toEqual` on the sample, a one-field-at-a-time table, group tables and index regex cases. |
| `apps/api/test/operations.ts` | done | The shared `PROPERTY_FIELDS` selects the new fields. |
| `apps/api/test/integration/property-details-delete.int.test.ts` | done | FR-04 AC1 extended, plus the "snapshot lacks astro / air_quality / pressure" case. |
| `apps/api/test/integration/create-property.int.test.ts` | done | FR-05 AC1 `toEqual` includes the typed fields. |
| `apps/api/test/integration/property-repository.int.test.ts` | done | TR-16 `toEqual` includes the domain fields. |
| `apps/api/test/integration/query-properties.int.test.ts` | done | Planned as "checked, no change". It is unchanged and passes. |
| `apps/web/src/hooks/useProperty.ts` | done | Query and `raw` comment updated. |
| `apps/web/src/lib/format.ts`, `format.test.ts` | done | `epaIndexLabel` with a 1–6 table and a 0 / 7 fallback. |
| `apps/web/src/test/fixtures.ts` | done | Sample fields added, and `PropertyFixture` widened. |
| `apps/web/src/pages/DetailsPage.tsx` | done | `DetailsGroup` with an `h2` and its own `<dl>`, rows filtered with `!== null`. |
| `apps/web/src/pages/DetailsPage.test.tsx` | done | `details()` scoped, AC1 on the first `<dl>`, AC6 per region, AC5 per group and row, zero values. |
| `context/test-plan.md` | done | TR-16 and TR-20 updated, TR-28 added, `weather.ts` target row updated. |
| `context/roadmap.md` | done | S-09 row added and set to `done` by `/implement`. This review sets it to `review`. |
| `apps/api/test/fixtures/weatherstack.ts` | unplanned | `SAMPLE_OPTIONAL_WEATHER`, logged under *Deviations*. |
| `context/changes/details-extra-weather/plan.md`, `plan-review.md` | unplanned | Change artifacts, as expected. |

The commit subject is `feat(details-extra-weather): …` and the plan had `feat(details): …`.
That follows the repo convention, so it is not a finding.

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | FR-12 AC6 is shown with units, `0` renders, and missing groups or rows are left out. Optional fields never throw, and AC1–AC5 tests are unchanged and pass. |
| Design | ok | The mapping lives in the domain, the adapter schema is untouched, and the default resolvers serve the domain object. |
| Safety | ok | Every optional field goes through zod with `.catch(undefined)`. No secrets and no new I/O. |
| Tests | concern | They are strong and behavioural, but one old test is now dead weight (R2), and one mutation target was run outside the test-plan list (R3). |
| Simplicity | ok | `DetailsGroup` plus row tuples avoid hand-written rows. The `decimalString` duplicate is already logged as a follow-up. |
| Plan fidelity | concern | The plan still marks the units "mb" / "mi" as UNVERIFIED, though its human check had to run before the commit (R1). |

## Findings
### R1: The plan still lists the pressure / visibility units as UNVERIFIED after the commit
- Severity: minor
- Where: `context/changes/details-extra-weather/plan.md:62`, `:202`
- Problem: The plan made it a pre-commit human check to confirm "mb" and "mi" against the
  Weatherstack docs. The commit shipped those labels (`DetailsPage.tsx`, the SDL descriptions
  "mb." / "Miles.", and the `DetailsPage.test.tsx` expectations). Both plan lines still say
  UNVERIFIED, and nothing records the result of the check. The artifact, which is the source
  of truth, therefore disagrees with what shipped.
- Fix: Record the outcome under *Risks* (e.g. "Confirmed in the Weatherstack units table on
  <date>: `f` → pressure mb, visibility miles"). If the check was not done, do it now.
- Effort: small
- Decision: fix. The *Risks* entry records the 2026-10-08 resolution: the official units table still does not render, but the `units=f` samples confirm both labels (`pressure` 1010 → mb, and a published `units=f` visibility of 10, the imperial cap, against 16 km in the metric examples). The labels are unchanged.

### R2: The old TR-03 "parses without astro, air_quality…" test is now dead weight
- Severity: minor
- Where: `apps/api/src/domain/weather.test.ts:61`
- Problem: It drops `astro`, `air_quality`, `pressure` and `uv_index`, then asserts only
  `temperature === 82`. `OPTIONAL_FIELD_CASES` and the two group tables drop the same fields
  and assert the whole result with `toEqual`, so this test cannot fail when they pass.
  `mutation.md` (*Dead-weight tests*) notes this and leaves it unchanged.
- Fix: Replace it with one table row (or one test) that drops all four fields together and
  asserts the whole object with `toEqual`. Keep the TR-03 label, since TR-03 is "missing
  non-key fields → success".
- Effort: small
- Decision: fix. The test is replaced by "TR-03: parses without astro, air_quality, pressure and uv_index together", which asserts the whole object with `toEqual`.

### R3: Stryker ran on `format.ts`, which is not a mutation target, and the test plan has no row for it
- Severity: minor
- Where: `context/changes/details-extra-weather/mutation.md:3-4`; `context/test-plan.md` *Mutation targets*
- Problem: CLAUDE.md says "Run Stryker only on the targets listed in `context/test-plan.md`".
  `apps/web/src/lib/format.ts:11-25` is not listed, and `list-and-details-pages/mutation.md:19`
  skipped `format.ts` on purpose. The run recorded "100% -> 100%" as if there were an earlier
  baseline. It also proposes a row under *Gaps for the test plan*, but `test-plan.md` was not
  updated. The result is harmless (13/13 killed), but the record and the rule disagree.
- Fix: Run `/test-plan` to add the `epaIndexLabel` row (TR-28, baseline 100% from S-09), and
  change the `format.ts` score line in `mutation.md` to "baseline 100%". The other option is
  to drop the `format.ts` run from `mutation.md`, if the label table is not meant to be a target.
- Effort: small
- Decision: fix + rule. A `format.ts` `epaIndexLabel` row (baseline 100%, S-09) is added to *Mutation targets* in `context/test-plan.md`. The `format.ts` score in `mutation.md` now reads "baseline 100%". The rule "Add a module to *Mutation targets* before running Stryker on it" is appended to `context/lessons.md`.
