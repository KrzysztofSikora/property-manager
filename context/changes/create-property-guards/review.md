# Review: create-property-guards

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 413 passed / 0 failed (`pnpm test`, 28 files, incl. Testcontainers)

Base: `b9ccf66` (parent of `d64251f`, the first `(create-property-guards)` commit) to `ec19fb8`,
plus the untracked files in the working tree.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/api/src/domain/errors.ts` | done | `reason` on `WeatherUnavailableError`; `WeatherQuotaExceededError`, `WeatherLocationMismatchError` (trim + 100 chars), `PropertyAlreadyExistsError`. Messages match *Design*. |
| `apps/api/src/adapters/weatherstack/response.ts` | done | `classifyWeatherstackError` (104/429 quota; 101/105/403 configuration); cause keeps `code`/`type`, never `info`. |
| `apps/api/src/adapters/weatherstack/response.test.ts` | done | TR-02 table asserts class, `code`, `reason` and the exact cause. |
| `apps/api/src/adapters/weatherstack/client.ts` | done | `timeoutMs` option, `DEFAULT_TIMEOUT_MS = 5000`; quota and configuration log at `error`, rest at `warn`. |
| `apps/api/src/adapters/weatherstack/client.test.ts` | done | `AbortSignal.timeout` spy (5000 / 50), `hang()`, status 503/429, per-code log level table, `info` sentinel. Non-JSON test folded into the table (logged under *Deviations*). |
| `apps/api/test/msw/weatherstack.ts` | done | `hang()` and `text(body)` (no unused `status`, per plan-review #5). |
| `apps/api/src/graphql/errors.test.ts` | done | FR-10 AC1 rows for all four new codes. |
| `apps/api/test/integration/create-property.int.test.ts` | done | Interim test replaced by the 14-row MSW table; FR-05 AC4; FR-07 AC2 given a Massachusetts region; FR-08 AC1–AC3; FR-06 AC6 with `requestId`. |
| `apps/api/src/services/property.service.ts` | done | Pre-check → weather → `regionMatchesState` → insert. |
| `apps/api/src/services/property.service.test.ts` | done | TR-09 table, mismatch, pre-check and race-branch tests. |
| `apps/api/src/domain/ports.ts` | done | `existsByAddress`. |
| `apps/api/src/repositories/property.repository.ts` | done | `existsByAddress` on the index expressions; `23505` + constraint name mapped; stale `DUPLICATE_PROPERTY` comment removed. |
| `apps/api/test/fakes/property-repository.ts` | done | `existsByAddress` only; `insert` unchanged (plan-review #2). |
| `apps/api/test/integration/property-repository.int.test.ts` | done | `existsByAddress` true/false table, duplicate insert with `cause.cause` 23505, lat-range violation propagates. |
| `context/prd.md` | done | FR-06 AC1/AC6, error-case table, docs source and the DC result in *Verified so far*. |
| `context/test-plan.md` | done | TR-01/02/04–07/09–11 statuses and wording; Cookbook lists `hang`/`text`. TR-03 and TR-12 statuses not updated (R2). |
| `context/changes/create-property-guards/{plan,plan-review,mutation}.md` | unplanned | Process artifacts. |
| `context/roadmap.md` | unplanned | Status change (process). |
| `ai-sessions/36-38-*.txt` | unplanned | Session exports; no Weatherstack key found in them. |
| `implement-S-02-2.txt`, `implement-S-02-3.txt`, `mutation-S-02.txt` (untracked, repo root) | unplanned | Session exports not yet moved to `ai-sessions/`; no Weatherstack key found in them. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | Every FR-05 AC4/AC5, FR-06 AC1–AC7, FR-08 AC1–AC3 and FR-10 AC1 row is implemented and proved by a named test; order matches PRD FR-05. |
| Design | ok | Classification in the adapter, region and order in the service, SQL and pg mapping in the repository; no layer skipped. |
| Safety | ok | `info` never kept, logged URLs redacted, sentinel tests put the key where the code must drop it; third-party `region` is trimmed and bounded. |
| Tests | concern | Strong overall; the repository's constraint-name and unwrapped-error branches have no test (R1), and some service rows test the fake (R3). |
| Simplicity | ok | Small functions, no dead code, no premature abstraction. |
| Plan fidelity | ok | All planned files done; the one deviation is logged. Two test-plan statuses left stale (R2). |

## Findings

### R1: The unique-violation guard's constraint-name and unwrapped-error branches are untested
- Severity: minor
- Where: `apps/api/src/repositories/property.repository.ts:23-35`
- Problem: The plan's decision (*Race enforcement*) is that only a `23505` on
  `properties_address_unique` maps to `PropertyAlreadyExistsError`, and that a bare
  `pg.DatabaseError` (no Drizzle wrapper) still maps. The integration tests cover only a wrapped
  `23505` on the address index and a wrapped `23514` (`properties_lat_range`). The `23514` row
  fails on `code`, so it never reaches the `constraint === ADDRESS_UNIQUE` check. Replacing that
  check with `true`, or the ternary with `error.cause`, keeps every test green. The test plan
  excludes this file from Stryker because "the integration tests in TR-06 guard it", so nothing
  would report it.
- Fix: Export `isAddressUniqueViolation` and add a hermetic `it.each` with constructed
  `pg.DatabaseError`s: wrapped and bare `23505` on the address index (true), `23505` on another
  constraint (false), `23514` on the address index (false), a non-Error value (false).
- Effort: small
- Decision: fixed. `isAddressUniqueViolation` exported; `property.repository.test.ts` adds a hermetic table (wrapped and bare `23505` on the index → true; other constraint, `23514`, look-alike cause, no cause, non-Error → false). TR-06 notes the table.

### R2: Test-plan statuses for TR-03 and TR-12 still say `planned` for S-02
- Severity: minor
- Where: `context/test-plan.md` rows TR-03 ("planned (S-01 happy path, S-02 failures)") and
  TR-12 ("planned (S-01, S-02)")
- Problem: S-02 added the FR-10 AC1 rows for all four new codes (`graphql/errors.test.ts`) and
  the integration missing-key-field row, so the S-02 half of both risks is covered, but the
  artifact still reads as a gap. Artifacts are the source of truth.
- Fix: Set TR-03 to `covered (S-01, S-02)` and TR-12 to `covered (S-01, S-02)` (or name what is
  left, if anything).
- Effort: small
- Decision: fixed. TR-03 and TR-12 set to `covered (S-01, S-02)`; nothing left for either.

### R3: Two service tests exercise only the in-memory fake or repeat the unit table
- Severity: minor
- Where: `apps/api/src/services/property.service.test.ts:180-191` and `:143-150`
- Problem: "an address with a different %s is stored" can only fail if
  `InMemoryPropertyRepository.existsByAddress` changes; the service just calls the port. The
  real rule is proved against PostgreSQL in `property-repository.int.test.ts`. "accepts a region
  that differs only in case and spacing" repeats the TR-09 table. `mutation.md` confirms neither
  kills a mutant the others miss.
- Fix: Drop both. Or, if the first one is meant to keep the fake in step with
  `properties_address_unique`, rename it to say so and move it next to the fake.
- Effort: small
- Decision: fixed, plus a rule. Both tests dropped; `lessons.md` gains "A service test must be able to fail through the service, not only through a fake".
