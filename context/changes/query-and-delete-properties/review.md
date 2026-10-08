# Review: query-and-delete-properties

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 480 passed / 0 failed (`pnpm test`, 32 files, incl.
Testcontainers). Also: `pnpm format:check` ok, `pnpm codegen` produces no drift.

Base: `e3c046c` (parent of `2dcedf1`), head `c3f0db5`, no uncommitted changes.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/api/schema.graphql` | done | `PropertySort`, `PropertyFilter`, `PropertyPage`, `properties`, `deleteProperty`; `createProperty` description lists all six codes. |
| `apps/api/src/graphql/generated/resolvers-types.ts` | done | Regenerated; `pnpm codegen` leaves no drift. |
| `apps/web/src/graphql/*` | absent | Logged under *Deviations*: the client preset emits only types that web documents use. |
| `apps/api/src/domain/property.ts` | done | The four types as designed. |
| `apps/api/src/graphql/properties-args.ts` | done | Null and blank mean absent, per-field normalization, 100-char cap, bounds, no echo of input. |
| `apps/api/src/graphql/properties-args.test.ts` | done | Covers every case in the plan's unit table, plus both sort values (added by the mutation check). |
| `apps/api/src/domain/ports.ts` | done | `list`, `deleteById`. |
| `apps/api/src/repositories/property.repository.ts` | done | `escapeLike`, `filterWhere`, `list` in a read-only repeatable-read transaction with Drizzle `count()`, `deleteById` via `DELETE … RETURNING`. |
| `apps/api/src/repositories/property.repository.test.ts` | done | `escapeLike` table. |
| `apps/api/src/services/property.service.ts` | done | `list` pass-through; `delete` throws `PropertyNotFoundError` on `false`. |
| `apps/api/src/services/property.service.test.ts` | done | `delete` tests fail through the service and assert `code` and message (lessons). |
| `apps/api/src/graphql/resolvers.ts` | done | `properties` uses `safeParse` + `badUserInput`; `deleteProperty` returns `PROPERTY_NOT_FOUND` for a malformed id without calling the service. |
| `apps/api/src/domain/errors.ts` | done | `PropertyNotFoundError`, id not echoed. |
| `apps/api/src/graphql/errors.test.ts` | done | FR-10 AC1 row added. |
| `apps/api/test/fakes/property-repository.ts` | done | `deleteById` implemented; `list` rejects as planned. |
| `apps/api/test/operations.ts` | done | `PROPERTIES`, `DELETE_PROPERTY`. |
| `apps/api/test/integration/query-properties.int.test.ts` | done | Every FR-01/02/03 AC, TR-13 extras incl. `\` (logged deviation), TR-14 with random v4 ids (logged deviation). |
| `apps/api/test/integration/property-details-delete.int.test.ts` | done | FR-04 AC1–AC4, FR-09 AC1–AC3, TR-15. |
| `apps/api/test/integration/create-property.int.test.ts` | done | FR-08 AC3 deletes through `DELETE_PROPERTY`; old `describe('property')` removed. |
| `context/test-plan.md` | done | TR-04/07/13/14/15 `covered (S-03)`, mutation target path named, `\` note added. |
| `apps/api/package.json` | unplanned | `test:mutation:properties-args` script from the mutation step; agreed with the user (`mutation.md`). |
| `apps/api/stryker.properties-args.config.mjs` | unplanned | Per-module `break: 85`, from the mutation step; reason recorded in `mutation.md`. |
| `context/changes/query-and-delete-properties/{plan,plan-review,mutation}.md` | unplanned | Workflow artifacts. |
| `ai-sessions/43–47-*.txt` | unplanned | Session exports (FR-15), named like earlier items. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | Every FR-01–FR-04, FR-09 AC and the FR-10 rows are met and proved through the API; null/blank/escape edge cases handled. |
| Design | ok | resolver → service → repository kept; filter SQL and escaping owned by the repository; delete is one race-free statement. |
| Safety | ok | zod at the boundary, bind parameters with escaped LIKE metacharacters, messages never echo input, malformed ids never reach PostgreSQL. |
| Tests | ok | Behavioural, deterministic (fixed `createdAt`, distinct streets), failure paths covered; mutation decisions plausible. One untested contract (R2). |
| Simplicity | ok | Small functions, no dead code, no premature abstraction. |
| Plan fidelity | ok | All divergences are logged under *Deviations*; one commit-footer slip (R1). |

## Findings
### R1: `Closes #5` is not on the last commit of the item
- Severity: minor
- Where: commit `922d056` (`Closes #5`); later commits `abe592f`, `00f055d`, `c3f0db5` use `Refs #5`
- Problem: CLAUDE.md says "the last commit of a roadmap item uses `Closes #<n>`". Here the
  phase 2 commit closes the issue, and three later commits of the same item (the mutation check,
  the docs and the Stryker config) only reference it. Once pushed, issue #5 closes on a commit
  that predates the mutation check and the review.
- Fix: put `Closes #5` on the last commit of the item, which is the review-fix commit if there is
  one. Otherwise amend the footer of `c3f0db5` before pushing. If you want the phase commit to
  close the issue, change the rule in CLAUDE.md to say so.
- Effort: small
- Decision: fix. Done: `922d056` was reworded to `Refs #5` before pushing; the last S-03 commit carries `Closes #5`.

### R2: No test checks that rows and `totalCount` come from one snapshot
- Severity: minor
- Where: `apps/api/src/repositories/property.repository.ts:93-110`
- Problem: the plan's phase 1 contract is "the rows and the count share the filter and one
  snapshot". No test exercises the `{ isolationLevel: 'repeatable read', accessMode: 'read only' }`
  options or the transaction. Removing the options, or replacing `tx` with `db` for the count,
  leaves every test green, because nothing writes between the two reads. A refactor could drop
  the guarantee unnoticed.
- Fix: add one integration test that inserts a row from a second connection between the two
  reads. For example, wrap `app.db.transaction` so its callback runs a `seedProperty` on a
  separate client after the first `select`, then assert `items.length === totalCount`. If the
  test harness makes that too awkward, accept it and record in the plan's *Deviations* that the
  snapshot is guaranteed by construction and checked only in review.
- Effort: medium
- Decision: defer. Logged in the plan's *Deviations* as a follow-up.
