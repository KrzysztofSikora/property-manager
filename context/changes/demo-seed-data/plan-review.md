# Plan review: demo-seed-data

Verdict: READY WITH NOTES

Second round. The plan now covers every finding from the first review (blocker 1 and minors 2–7).
Blocker 1 was the open address list, now *Seed addresses*. The other fixes: the response schema
takes any `code` string; a 4xx body is parsed as GraphQL first; the D-07 key is lower-cased; the
guardrail scans `e2e/*.ts` and `.claude/settings.json`; the `src/seed/` ESLint block is added;
the int test uses a no-op `sleep` and the CLI trade-off is recorded. No `BLOCKING` marker is
left.

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | minor | Grounding / artifacts | The plan replaces Zillow homes with public landmarks (*Decisions*, "Where do the addresses come from?"), but `context/roadmap.md` (the Could entry for #13, uncommitted diff) still says "creates a few real Zillow addresses through `createProperty`". The plan changes only the S-10 status in the roadmap. Per CLAUDE.md, the artifacts would then disagree. | In the `context/roadmap.md` entry, change "real Zillow addresses" to "real US addresses (public landmarks, see the plan)". Optionally add one README line saying why landmarks replace Zillow (B-N7). |
| 2 | minor | Failure paths | `WEATHER_LOCATION_MISMATCH` stops the run (`regionMatchesState` requires an exact state-name match, `apps/api/src/services/property.service.ts:27-29`). Unlike a 429, it happens again on every re-run, because the same address fails again. *Risks* says only "re-running continues where it stopped", which holds for 429 and not for a mismatch. | In the README "Demo data" section, say that a mismatch or `BAD_USER_INPUT` means the address in `apps/api/src/seed/addresses.ts` must be changed, and that a re-run does not fix it. No code change. |
| 3 | minor | Phasing / tests | The guardrail asserts that no scanned file "contains `seed`" as a plain substring. That is safe (a false hit fails loudly), but the plan leaves the match rule open. For example, a future Playwright `--seed` flag or a "seeded" comment in `e2e/*.ts` would trip it. | Match `\bseed\b` (case-insensitive) or `pnpm seed` / `seed-cli`, and say which in the test name. Keep the control fixture. |

## What is good

- **Traceability:** FR-16 AC1 (`context/prd.md:327-329`) maps clause by clause to tests and human
  checks under "Proves". The roadmap row S-10 / #13 depends on S-06, and the commit uses
  `Closes #13`.
- **Grounding** (checked):
  - `createProperty` is at `apps/api/schema.graphql:140`, and `ERROR_CODES` with
    `PROPERTY_ALREADY_EXISTS` is in `packages/shared/src/errors.ts:2-10`.
  - The duplicate check runs before the weather call (`property.service.ts:40-41`).
  - The 429 note is in the README (`README.md:123-129`).
  - The plan follows the `migrate-cli.ts` pattern (`import.meta.main`, `Promise<0 | 1>`).
  - `parseEnv` / `REASONS` behave as the plan says. Unknown keys are stripped, so
    `loadConfig` is unaffected.
  - In `eslint.config.ts`, `restrictImports` repeats the `.js` pattern for each block, so a new
    `src/seed/` block loses nothing.
  - MSW runs with `onUnhandledFrame: 'error'` and no default handlers.
  - `createTestApp` exposes only `execute`.
  - None of the guardrail's target files mentions `seed` today (grep over Compose, the
    Dockerfiles, CI, pre-commit, `e2e/*.ts`, `.claude/settings.json`, the hook script and all
    `package.json` files).
  - Codegen `documents` cover only `apps/web/src/**`, so a plain query string in `apps/api/src/seed/`
    does not affect it.
- **Design:** the seed is an HTTP client of the API. It needs no key and no DB access, and ESLint
  enforces this. No real Weatherstack call in tests (MSW in unit tests, `FakeWeatherClient` in
  api-int).
- **Failure paths:** each outcome is defined and tested. These are skip, stop on any other code,
  a non-contract code, a 4xx with a GraphQL body, a 500 with a non-GraphQL body, a network error,
  a malformed 200 and null data. The tests assert the reason, not only the exit code.
- **Lessons:** followed. `seed.ts` is added to *Mutation targets* before Stryker runs, with
  "baseline N%" on the first run. The plan re-checks the earlier `env.ts` `strengthen` rows, and
  the address-uniqueness key matches D-07.
- The addresses are real and well known (state capitols and the Space Needle), one per state,
  each away from state borders. Their ZIP codes are correct for those buildings.
