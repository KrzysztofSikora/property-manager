# Mutation check: query-and-delete-properties

Targets: `apps/api/src/graphql/properties-args.ts` (whole file),
`apps/api/src/services/property.service.ts:57-66` (`list`, `delete`) · Tests:
`apps/api/vitest.unit.config.ts` (command runner, `--concurrency 4`)
Score: 95.83% -> 97.92% (before 46 / 2 / 0 / 0, after 47 / 1 / 0 / 0; killed / survived /
no coverage / timeout)

Per file after: `properties-args.ts` 100% (42/42, first run, baseline), `property.service.ts:57-66`
83.3% (5/6). No timeouts, so the score is not inflated by load (lessons: Stryker concurrency).

## Mutants
| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `properties-args.ts:38` | StringLiteral | `z.enum(['CREATED_AT_DESC', …])` → `z.enum(["", …])` | strengthen | An explicit `sort: CREATED_AT_DESC` would be rejected with BAD_USER_INPUT (FR-02 AC1). Only `CREATED_AT_ASC` and the default were tested. The sort test is now `it.each` over both values. |
| `property.service.ts:58` | BlockStatement | `list(query) {}` (returns `undefined`) | accept | A one-line pass-through to `repository.list`. A hermetic test would only show that the in-memory fake's output comes back. `query-properties.int.test.ts` (FR-01 AC1–AC6) fails on it, since `properties` is non-null; Stryker does not run the integration tests. |

## Dead-weight tests
None found. The new cases are already parametrised (`limit` bounds, blank filter values,
per-field length cap).

## Gaps for the test plan
None. `properties-args.ts` baseline is 100% (target 90%). The local `break` can be set to the
85% from the test plan if you agree.
