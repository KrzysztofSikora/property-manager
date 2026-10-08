# Review: list-filters-in-url

Verdict: APPROVE
Gates: typecheck ok, lint ok (format:check ok), tests 598 passed / 0 failed (`pnpm test`, incl.
Testcontainers); `pnpm e2e` 2 passed

Base: `a14f453` (parent of `7aa6e44`). Diff: `a14f453...HEAD`, working tree clean.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/web/src/lib/list-search.ts` | done | `parseListSearch` / `toListSearch` as in *Design*: per-field `.catch`, state upper-cased then `isStateCode`, bounds 100 / 5, `sort=asc` only, fixed key order, trimmed write. |
| `apps/web/src/lib/list-search.test.ts` | done | Defaults, every field, one invalid field at a time (lesson), sort table, repeated key, blanks/trim, key order, round trip. |
| `apps/web/src/pages/ListPage.tsx` | done | `useSearchParams` + parse replace the `useState`s; Apply skips an unchanged URL; form keyed by the filter part; `defaultValue` on inputs; push (no `replace`). |
| `apps/web/src/pages/ListPage.test.tsx` | done | Router probe; all six planned AC3a tests; AC6 whitespace test changed as planned; extra `/?city=+++` test from the mutation run. |
| `e2e/property-journey.spec.ts` | done | Anchored `toHaveURL`, reload, input value and rows checked. |
| `context/test-plan.md` | done | TR-26 `covered (S-07)` and the `list-search.ts` mutation-target row. |
| `context/roadmap.md` | diverged | Plan: status `done` in the final commit with `Closes #9`. It went to `done` in `4c9fe33` ("close plan", `Closes #9`), before the mutation run and this review; two `Refs #9` commits follow. See R1. |
| `context/changes/list-filters-in-url/{plan,plan-review,mutation}.md` | unplanned | Workflow artifacts of `/plan`, `/plan-review`, `/mutation`. |
| `context/lessons.md` | unplanned | New lesson from the mutation run (`/mutation`). |
| `README.md`, `ai-sessions/69–73-*.txt` | unplanned | Session exports and their README row (deliverable process). Footnote ³ "review has not run yet" goes stale with this review (R1). |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | AC3a met (write, deep link, reload, Back, invalid values ignored); AC2/AC3/AC5–AC7 tests still pass. One edge with hand-ordered links (R2). |
| Design | ok | Pure zod module in `lib/`, page only wires URL ↔ hook; no API or hook change; consistent with neighbouring `lib/` helpers. |
| Safety | ok | URL input zod-parsed at the boundary with per-field fallbacks; no secrets; bounds match the inputs. |
| Tests | ok | Behaviour asserted through the URL probe, inputs, requests and rows; one-invalid-field lesson followed; mutation decisions (`:33` accept via the anchored E2E regex, `:57` and `:101` equivalent) are plausible and checked against the code. |
| Simplicity | ok | Small, well-named functions; no dead code. |
| Plan fidelity | concern | Code matches the plan; the roadmap / `Closes #9` timing does not (R1). |

## Findings

### R1: Item closed (`Closes #9`, roadmap `done`) before mutation and review
- Severity: minor
- Where: commit `4c9fe33` (`context/roadmap.md:20`), followed by `3642791` and `f24a332`
  (`Refs #9`); `README.md:205` row and `:209` footnote ³
- Problem: CLAUDE.md says the last commit of a roadmap item uses `Closes #<n>`, and the plan
  (Phase 2) says the `done` flip happens "in the final commit (`Closes #9`), as in earlier
  items". S-05 and S-06 did this after the review (`4f0baeb`, `b49526a`). Here `Closes #9` and
  `done` land in "close plan", and two more commits follow with `Refs #9`. Pushing this closes
  issue #9 before the review is decided. The README row also says review "has not run yet".
- Fix: after the review decisions, add the closing commit as in S-06 (`docs(roadmap): mark S-07
  list-filters-in-url done`, `Closes #9`), link `ai-sessions/74-review-S-07.txt` in the README
  row and drop footnote ³. The roadmap is set to `review` by this review.
- Effort: small
- Decision: fixed — "close plan" (unpushed) was amended to `Refs #9` and leaves S-07 `in-progress`; the closing commit `docs(roadmap): mark S-07 list-filters-in-url done` (`Closes #9`) comes last; the README row links `ai-sessions/74-review-S-07.txt` and footnote ³ is gone.

### R2: Apply on a link with a different key order pushes a no-op history entry
- Severity: minor
- Where: `apps/web/src/pages/ListPage.tsx:44`
- Problem: the skip compares `next.toString()` with the raw `searchParams.toString()`, which is
  order- and extra-key-sensitive. On `/?zip=85268&city=Austin` (or `/?state=XX&city=austin`),
  Apply with the inputs untouched gives `city=Austin&zip=85268` ≠ `zip=85268&city=Austin`
  (checked with `URLSearchParams` in Node), so it pushes an entry whose list state is the same;
  Back then seems to do nothing, the case plan-review #3 meant to prevent. Only hand-written or
  hand-edited links reach it, and only for the first Apply.
- Fix: compare with the canonical form of the current state,
  `toListSearch(parseListSearch(searchParams)).toString()`, which also leaves an invalid value in
  the URL until the user changes something (Decision 3). Add a `ListPage` test: open
  `/?zip=85268&city=Austin`, Apply, Back → URL unchanged. Or accept it as a hand-edited-link edge
  and note it under *Deviations*.
- Effort: small
- Decision: fixed — Apply compares with `toListSearch(parseListSearch(searchParams))`; new `ListPage` test opens `/?zip=85268&city=Austin`, applies and expects the URL unchanged (fails without the fix).
