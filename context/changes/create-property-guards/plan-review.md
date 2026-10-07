# Plan review: create-property-guards

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Phasing (build green) | Phase 2 will break an existing test the plan does not list. `apps/api/test/integration/create-property.int.test.ts:136-147` (FR-07 AC2) creates `state: 'MA'` with the default `FakeWeatherClient`, which serves the sample with `"region":"Arizona"` (`docs/samples/weatherstack-current.json`). Once `regionMatchesState` runs, this returns `WEATHER_LOCATION_MISMATCH`. The Phase 2 file list names only the new FR-05 AC4 test in that file. | Add this test to the Phase 2 files: give it `new FakeWeatherClient(weatherstackResponse({ location: { region: 'Massachusetts' } }))`. In Phase 2, grep the tests for any other non-AZ create. |
| 2 | minor | Design (simpler alternative) | Phase 3 says the fake's "`insert` throws `PropertyAlreadyExistsError` on the same key, so the service unit tests can exercise the race branch". A sequential unit test cannot reach `insert` with a key that is already stored after a clean pre-check, because the fake's `existsByAddress` would return true first. The existing `failInsert(error)` (`test/fakes/property-repository.ts:12-15`) already covers this branch. | Drop the duplicate logic from the fake's `insert`. Use `repository.failInsert(new PropertyAlreadyExistsError())` for the "duplicate on insert after a clean pre-check" unit test. |
| 3 | minor | Failure paths (timeout) | The proof of the default timeout is weak: "`DEFAULT_TIMEOUT_MS === 5000`, and a stubbed `fetch` receives a signal when no `timeoutMs` is passed". Both still pass if the default is wired to something other than the constant (for example `timeoutMs = 0`, or a different literal). Stryker would likely report that as a survivor. | Spy on `AbortSignal.timeout`. Assert it is called with `5000` when no option is passed and with `50` when `timeoutMs: 50` is passed. |
| 4 | minor | Human checks / secrets | The DC check is "one real `GET /current` for a DC address … never the URL with the key". A hand-built request puts the key into a shell command or URL. CLAUDE.md also says "The API is called only in the create-property mutation". | Run the check after Phase 2 lands, through `pnpm dev` and a `createProperty` with the DC address. A success proves the region matches. A `WEATHER_LOCATION_MISMATCH` message shows the actual region, which is how the plan designed it. It costs the same single call, and nobody handles the key. |
| 5 | minor | Scope | The Phase 3 mutation run includes `graphql/errors.ts`, but the plan says "`maskError` needs no change, because it maps any `DomainError`". Per `context/test-plan.md:255`, the targets are the ones "that the change touches". Also, `text(body, status?)` has a `status` parameter that no planned row uses. | Either drop `graphql/errors.ts` from the Stryker run, or state that it is a deliberate re-check of the new test rows. Drop the unused `status` parameter. |

## What is good

- Grounding is accurate. These line references and claims check out:
  - `response.ts:22-36`, `client.ts:15` (`TIMEOUT_MS`), `ports.ts`, the service comment and `schema.ts`'s `properties_address_unique` expressions.
  - Drizzle `0.45.3` puts the pg error on `.cause` (`schema.int.test.ts:62-71`).
  - `delay` is exported from the msw 3.0.2 root (`lib/core/index.d.ts:15`).
  - `createTestApp({ weather: 'msw' })` exists, and `withBarrier` exists.
  - `stateName` returns "District of Columbia" for DC.
  - `fileParallelism: false` is set in `vitest.int.config.ts:18`.
- Every roadmap AC (FR-05 AC4/AC5, FR-06 AC1–AC7, FR-08 AC1–AC3, the four FR-10 rows) is proved by a named test. The FR-08 AC3 deviation from "repository-level delete" has a reason.
- The race test is deterministic. The barrier sits after the pre-check, and "2 weather calls" proves the index did the work, not the pre-check.
- The plan follows the lessons:
  - It asserts `reason`, `cause.weatherstackError.code` and the `23505` cause, not only the error class.
  - The sentinel key is placed in `info` and inside a `fetch` error message that quotes the URL. Those are the parts the code must drop.
  - The mutation run uses `--concurrency 4`.
- Each decision has a reason and an owner. The user owns the open Weatherstack questions (body 429, 403/105). The constraint-name check keeps a future unique index from being reported as a duplicate address.
- The layering is sound. The region check is in the service and the classification is in the adapter. No change to `maskError` is needed because it maps any `DomainError`.
