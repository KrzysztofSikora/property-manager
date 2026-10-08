# Plan review: list-filters-in-url

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Traceability / Phasing | The plan says "FR-11 AC1–AC3 and AC5–AC7 still pass unchanged" (plan.md:17). One existing AC6 test will fail. `apps/web/src/pages/ListPage.test.tsx:275-291` (`a whitespace-only %s is a blank filter`) types `'   '`, clicks Apply and waits for `requests` to reach length 2. Today `setFilter` stores `{ city: '   ' }`, which is a new query key, so a second request is sent. Under the plan, `toListSearch` drops whitespace-only values (plan.md:99), so the URL and the parsed filter stay `''`. The query key does not change and no second request is sent. The form key (`searchParams.toString()`) does not change either, so `'   '` stays in the input. | Say in Phase 2 that this test changes. It should assert that the URL stays empty, that only one request was sent (or that the last request is `{ filter: {} }`) and that "No properties yet" shows. Record the behaviour change (a blank Apply no longer re-fetches) under *Risks*. |
| 2 | minor | Design | Keying the form by the whole search string (plan.md:111) remounts the form on a sort change, which throws away city or zip text that was typed but not applied (plan.md:179-181). Today the uncontrolled form keeps that text through a sort change. A simpler key avoids the regression: key by the filter part only, e.g. `toListSearch({ filter, sort: 'CREATED_AT_DESC' }).toString()`. | Key the form by the serialized filter, not the full search string, and drop the risk entry. If the current choice stays, add a test that pins the behaviour. |
| 3 | minor | Design | Each Apply pushes a history entry, even when the serialized URL equals the current one (same filters, or whitespace only). Back then seems to do nothing. Decision 2 ("Back undoes the last change") does not cover this case. | Skip `setSearchParams` when `toListSearch(...).toString() === searchParams.toString()`, or accept it and say so. |
| 4 | minor | Phasing | The Back test (plan.md:157) checks that the first filter is restored "in the request". On Back the first key is already cached. It is refetched only because it is stale (`staleTime` 0), and the recorded order then includes the placeholder phase. | Assert on the last recorded request (`requests.at(-1)`) and on the rows, not on an exact request array. |
| 5 | minor | Scope | `context/roadmap.md` already holds the S-07 Overview row and the *Later* #9 note in the working tree (uncommitted `git diff`), while Phase 1/2 list them as work to do (plan.md:29, 165). | Commit them with Phase 1 (`Refs #9`), and keep only the status flip for the final commit. |

## What is good

- Every cited file, line and symbol checks out: `ListPage.tsx:26-28,33-41,53,69,80-84`,
  `useProperties.ts:26-32` (`toFilter`), `test-plan.md:122`, `isStateCode`/`US_STATES`,
  `renderWithProviders({ route })`, and `e2e/property-journey.spec.ts:33-37`.
- The React Router claims match the current docs: `setSearchParams` navigates, accepts
  `NavigateOptions`, pushes by default, and calls in the same tick are not queued
  (reactrouter.com/api/hooks/useSearchParams).
- The design stays small: one pure zod-backed module with no React, no API or hook changes, and
  `toFilter` remains the only request-side rule.
- The unit table follows the lesson "exactly one invalid field" (the city/zip boundaries, `state=XX`
  next to a valid city), and the new module is added as a mutation target.
- The Playwright reload step proves AC3a end to end almost for free, and the out-of-scope items
  (pagination, nav links, rewriting the URL) are explicit.
