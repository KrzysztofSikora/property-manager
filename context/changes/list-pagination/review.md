# Review: list-pagination

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 626 passed / 0 failed (`pnpm test`, 40 files, incl. Testcontainers)

Base: `1ef3378` (parent of `5069c19`, the first `(list-pagination)` commit). Diff: `1ef3378...HEAD`,
no uncommitted changes under `apps/` or `context/` (the untracked `*-S-08.txt` session exports
are outside the diff).

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/web/src/lib/list-search.ts` | done | `page` in `ListState`, regex `^[1-9]\d{0,5}$` with `.catch(1)`, written last and only when `> 1`. `toListSearch` takes an optional `page`. |
| `apps/web/src/lib/list-search.test.ts` | done | Every planned parse case (one invalid field each), repeated key, write order, page 1 left out, round trip. |
| `apps/web/src/hooks/useProperties.ts` | done | `PAGE_SIZE = 20`, `$limit` / `$offset`, `page` in the query key, the "pagination is #10" comment removed. |
| `apps/web/src/graphql/gql.ts`, `graphql.ts` | done | Codegen output; `PropertiesQueryVariables` gains `limit` / `offset`. The drift check passes in `pnpm test`. |
| `apps/web/src/pages/ListPage.tsx` | done | Bar in the rows branch only, `totalCount > PAGE_SIZE`, both buttons disabled during placeholder data, Apply compared without the page, sort and filter writes drop the page. The past-the-end check is `page > pageCount` (logged under *Deviations*). |
| `apps/web/src/pages/ListPage.test.tsx` | done | Every planned AC4 test, plus the logged placeholder test. All exact-request assertions gain `limit: 20, offset: 0`. The AC1 `not.toHaveProperty('limit')` is replaced. |
| `apps/web/src/test/render.tsx` | done | `initialEntries` option, `route` kept (logged under *Deviations*). |
| `context/test-plan.md` | done | TR-27 `covered (S-08)` with the bound tests; both mutation-target rows updated. |
| `context/roadmap.md` | done | S-08 row and the *Later* #10 note. `done` and `Closes #10` are still to come, after the review as in S-07 (`9b94b06`). Status set to `review` by this review. |
| `context/changes/list-pagination/{plan,plan-review,mutation}.md` | unplanned | Process artifacts from `/plan`, `/plan-review` and `/mutation`. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | AC4 paths work: page size, label and total, URL round trip, page 1 after a filter or sort change, past-the-end replace that skips placeholder data and pending state. |
| Design | ok | URL parsing stays in `list-search.ts`, page → `limit` / `offset` in the hook, `ListPage` only wires them. No API change. |
| Safety | ok | `page` is validated by zod at the URL boundary; the 6-digit cap keeps the offset inside GraphQL `Int`. No secrets or new external calls. |
| Tests | ok | Behaviour tests through MSW and a router probe. They pin each bound in `ListPage.tsx`. A hand mutation dropping `properties.isSuccess` from `pastTheEnd` fails 6 tests. Both `equivalent` survivors in `mutation.md` hold: the API trims the city and zip filters (`apps/api/src/graphql/properties-args.ts:20-22`). |
| Simplicity | ok | Small diff; `goToPage` and `pageCount` are shared by the bar and the effect. |
| Plan fidelity | ok | The 3 changes from the plan are logged under *Deviations*. |

## Findings
### R1: Keyboard focus is lost after Previous or Next
- Severity: minor
- Where: `apps/web/src/pages/ListPage.tsx:206`, `:219`
- Problem: the button that was just pressed becomes `disabled` while `isPlaceholderData` is set.
  A disabled button cannot keep focus, so the browser moves focus to `<body>`, and it does not
  come back when the button is enabled again. A keyboard user who presses Enter on Next has
  to tab through the filter form and every row link to reach Next again. Checked in Playwright
  Chromium with a button that disables itself on click and re-enables after 200 ms:
  `document.activeElement` is `BODY` afterwards, and a second Enter does nothing. The plan
  chose `disabled` partly so "the state is clear to screen readers" (Decisions, "Previous /
  Next at the ends").
- Fix: during placeholder data, keep the buttons focusable with `aria-disabled="true"` and
  return early in `onClick`. Keep the real `disabled` for the page-1 and last-page ends. The
  "while the next page loads" test then asserts `aria-disabled` and that a second click sends no
  request. Option 2: keep `disabled` and move focus back to the button (a ref plus an effect
  on `isPlaceholderData`). This keeps the markup but adds focus code.
- Effort: small
- Decision: fix. Placeholder state now uses `aria-disabled` plus an early return in `onClick`; real `disabled` stays for the ends. The loading test asserts the buttons stay enabled with `aria-disabled="true"`, keep focus, and that clicks during loading send no request. Hand mutations (dropping either guard, or restoring `disabled` during loading) each fail it.
