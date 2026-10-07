# Plan review: property-schema

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | 7 Failure paths | `migrate-cli.ts` promises "Exit 0 on success, 1 on a config or migration error, and the URL is never printed" (plan, Phase 2 Files), but no test proves it. Only the human check runs the happy path. Not printing the URL is a secrets rule (CLAUDE.md *Rules*), because `DATABASE_URL` holds a password. | Add one test: run the CLI (or an exported `main(env, stderr)`) with an unreachable `DATABASE_URL` whose password is a sentinel. Assert exit code 1 and that stderr has no sentinel. Also add one test where an invalid URL gives `ConfigError` and exit 1. |
| 2 | minor | 4 Phasing | Phase 2's `schema.int.test.ts` inserts colliding rows (the unique test, then the FR-08 AC3 test re-inserts the same address). But `resetDb` arrives only in Phase 3 (`helpers/db.ts`), so Phase 2 has to clean up inline and Phase 3 then duplicates it. | Move `helpers/db.ts` (`resetDb`, `countProperties`) into Phase 2, or say explicitly that the schema test truncates in `beforeEach` and switches to `resetDb` in Phase 3. |
| 3 | minor | 3 Grounding | Phase 3 says `harness.int.test.ts` "replaces the hand-built app in `smoke.int.test.ts`", but `smoke.int.test.ts` is not in the Files list. It also holds the TR-25 test (`apps/api/test/integration/smoke.int.test.ts:39-47`), so it is unclear whether the file is edited, renamed or deleted. | State the fate of `smoke.int.test.ts` and keep the TR-25 case. |
| 4 | minor | 7 Failure paths | The CHECK `weather_data ? 'units' AND weather_data ? 'current'` also passes for a JSON array `["units","current"]`, because jsonb `?` matches string array elements. The test list (`weather_data {}` → `23514`) misses this. | Add `jsonb_typeof(weather_data) = 'object'` to the CHECK, or accept the gap in *Decisions* with a reason (zod guards the boundary). |
| 5 | minor | 6 Design | The ESLint change bans `**/db/**` for `graphql/**` and `services/**` only. Adapters (`eslint.config.ts:57-60`) could still import the DB, though tech-stack places them beside repositories as HTTP-only (`tech-stack.md:273-275`). | Add `**/db/**` to the adapters group too, or record why not. |
| 6 | minor | 4 Phasing | The "required column omitted → `23502`" `it.each` goes through Drizzle `insert`. The `NewPropertyRow` type rejects the missing keys, and `any` is banned. The plan does not say how the test builds the bad row. | Note the approach: a raw `sql` insert, or a `Partial<NewPropertyRow>` passed through a `pg` client. Do not use casts to `any`. |
| 7 | minor | 3 Grounding | The Cookbook (`context/test-plan.md:201,215`) documents `createTestApp({ weather: ... })`. The plan builds `createTestApp()` with no options. The plan already marks the Cookbook for update, but the end-state line "helpers exist under their documented names" could pass a grep while the signature differs. | In the Phase 3 Cookbook update, mark the `weather` option as "added in S-01", the same as `FakeWeatherClient`. |

## What is good

- Every repo citation checks out: `env.ts:16-36`, `postgres.ts:13-16`, `logger.ts:5`, `app.ts`
  composition root, `eslint.config.ts:51-60`, `pg` 8.23 with no drizzle installed, the empty
  `packages/shared`, the `.prettierignore` gap, and the `docs/samples` fields (`region: "Arizona"`,
  string `lat`/`lon`).
- The library claims match the Drizzle docs (context7): `check(name, sql)` in the table
  callback, `uniqueIndex().on(sql\`lower(...)\`)`, `drizzle({ client: pool })`, and
  `migrate(db, { migrationsFolder })`. A spike backs the 0.x layout and the `DrizzleQueryError.cause` surprise, and
  the plan carries the cause finding forward to S-02.
- The roadmap acceptance maps to concrete integration tests: migration on an empty DB, the
  case-only duplicate → `23505` on the named constraint, and null → `23502`. The tests also
  cover the boundary values and the FR-08 AC3 re-insert.
- `loadDatabaseConfig` keeps `db:migrate` free of the Weatherstack key, and it reuses the single URL rule.
- Scope stays tight. Deferring `FakeWeatherClient` until the S-01 port exists is well reasoned, and
  *Out of scope* is respected.
- The CI drift step follows the existing codegen-drift pattern.
- Every *Decisions* row has a reason. No unknown is BLOCKING, and no `lessons.md` exists yet.
