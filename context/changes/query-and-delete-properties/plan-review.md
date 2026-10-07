# Plan review: query-and-delete-properties

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | minor | Traceability | FR-01 AC5 names three rejected inputs (`limit: 0`, `limit: 101`, `offset: -1`, `context/prd.md:77-80`), but the integration test sends only "`limit: 0` → `BAD_USER_INPUT`". The other two are proved only by the unit table. That does prove the bounds, but the AC is written at the API level, and an `offset` that the resolver forgets to parse would still pass. | Make the phase 1 AC5 integration case an `it.each` over `{limit: 0}`, `{limit: 101}` and `{offset: -1}`, and check `fields[0].field` in each (`limit` / `offset`). It costs almost nothing. |
| 2 | minor | Grounding / Design | The plan says "then `count(*)` with the same `where`". A raw `sql\`count(*)\`` comes back from `pg` as a bigint string, so `totalCount` would be `"25"`, which does not match `PropertyPage.totalCount: number` and depends on how the GraphQL `Int` serializer handles strings. The repo already uses Drizzle's `count()`, which maps to a number (`apps/api/test/helpers/db.ts:1,14`). | In the Design section, say that the count uses `count()` from `drizzle-orm` (or `db.$count`), not raw `count(*)`. |
| 3 | minor | Phasing | The agent check "`pnpm codegen` (no drift afterwards)" has no command that fails when there is drift. | Spell it out: `pnpm codegen && git diff --exit-code -- apps/api/src/graphql/generated apps/web/src/graphql`, run after the regenerated files are staged or committed. |
| 4 | minor | Design | In the TR-14 test, "the order equals the `id` order" has to match how PostgreSQL orders `uuid` values (byte order). For lowercase canonical UUIDs that is plain string `<` order, but `localeCompare` or `toSorted()` with a collator could differ. | Note in the plan that the expected order is built with a plain code-unit comparison (`[...ids].sort()`), reversed for DESC. |
| 5 | minor | Grounding | The plan says `escapeLike` is tested in `property.repository.test.ts` ("`escapeLike` table"), and that the TR-13 integration test seeds a city containing `%` or `_` through `seedProperty`. Both are fine: `city` has no format CHECK (`apps/api/src/db/schema.ts:41-49`) or regex (`packages/shared/src/address.ts:16-20`), so such a row can exist through the API too. Each seeded row also needs a distinct address because of `properties_address_unique` (`schema.ts:35-40`). The plan already says "distinct streets" for the 25-row seeds, but not for the filter seeds, which reuse `validInput()`'s street. | Note that every `seedProperty` call in both new files overrides `street` (or uses a small `seedMany` helper), so seeding never trips the unique index. |

## What is good

- Every cited file, symbol and line is real at `e3c046c`. `resolvers.ts:7,17-20`,
  `property.service.ts:5-10,47-49`, `ports.ts:10-16`, `property.repository.ts:13-21`,
  `graphql/errors.ts:13-25,62-75`, `errors.test.ts:103-130`,
  `create-property.int.test.ts:324-349`, `ERROR_CODES` with `PROPERTY_NOT_FOUND`, and
  `enumsAsTypes` in `codegen.ts` all match. The `createProperty` description really lists only
  three codes (`schema.graphql:52-55`).
- The library claims match the installed source. Drizzle 0.45.3 `PgTransactionConfig` has
  `isolationLevel: 'repeatable read'` and `accessMode: 'read only'`
  (`drizzle-orm/pg-core/session.d.ts:32-33`), and `and()` filters out `undefined` operands
  (`sql/expressions/conditions.js:26-31`). `\` is the default `LIKE` escape in PostgreSQL.
- The layering fits the ESLint boundaries. The resolver uses only zod, services and
  `domain/errors` (`eslint.config.ts:51-58`), and the repository owns `escapeLike` and the SQL.
- Two good decisions: count and rows read from one repeatable-read snapshot, and delete plus
  not-found check done as one `DELETE … RETURNING`. Both avoid races without extra machinery.
- The plan applies the S-02 lesson correctly. There is no service test for the pass-through
  `list`, the `delete` test fails through the service, and the error code is asserted rather
  than the class.
- The plan handles explicit `null` args (`Maybe<T>`), which is easy to miss.
- Scope stays tight: no UI, no cursor paging, no move to `shared`. The ACs in the end state
  map one to one to the roadmap's S-03 acceptance line.
