# Review: property-schema

Verdict: APPROVE WITH FOLLOW-UPS
Gates: typecheck ok, lint ok, tests 153 passed / 0 failed (18 files, incl. `api-int` on
Testcontainers); format:check ok

Base: `e274868` (parent of `578325a`, the first `(property-schema)` commit). Uncommitted:
only untracked session exports at the repo root (see R4).

## Plan vs diff

| File | Status | Note |
|------|--------|------|
| `packages/shared/src/states.ts` | done | 51 entries, `isStateCode` via `Object.hasOwn` (rejects `toString`), `stateName`. |
| `packages/shared/src/errors.ts` | done | 7 FR-10 codes in order, `as const`, no enum. |
| `packages/shared/src/index.ts` | done | Re-exports both. |
| `packages/shared/src/states.test.ts` | done | Plus `AL`/`WY`, `''`, prototype keys, no duplicate names. |
| `packages/shared/src/errors.test.ts` | done | |
| `apps/api/package.json` | done | drizzle-orm 0.45.3, drizzle-kit 0.31.11, both scripts. |
| `package.json` (root) | done | Forwards `db:generate` / `db:migrate`. |
| `apps/api/drizzle.config.ts` | done | Added to `tsconfig.json` `include`. |
| `apps/api/tsconfig.json` | done | |
| `apps/api/src/db/schema.ts` | done | Columns, CHECKs, expression unique index, `WeatherSnapshot`, row types. |
| `apps/api/src/db/client.ts` | done | `DbHandle` named type (logged deviation). |
| `apps/api/src/db/migrate.ts` | done | `max: 1` pool, folder from `import.meta.url`, pool closed in `finally`. |
| `apps/api/src/db/migrate-cli.ts` | done | `runMigrateCli(env, stderr)`, `import.meta.main` entry, URL and password redacted. |
| `apps/api/src/db/migrate-cli.test.ts` | done | Extra redaction and reason cases (logged deviation + mutation step). |
| `apps/api/drizzle/0000_create_properties.sql`, `meta/*` | done | Constraint names and index expression as planned; `db:generate` reports no changes. |
| `apps/api/src/config/env.ts` | done | `parseEnv` shared by `loadConfig` and `loadDatabaseConfig`; one `databaseUrl` rule. |
| `apps/api/src/config/env.test.ts` | done | |
| `apps/api/test/setup/postgres.ts` | done | Migrates before `provide`. |
| `apps/api/test/helpers/db.ts` | done | `resetDb`, `countProperties`, `seedProperty` through the table. |
| `apps/api/test/integration/schema.int.test.ts` | done | All planned cases plus extra CHECK rows; `insertRaw` for untyped rows, no `any`. |
| `eslint.config.ts` | done | `**/db/**` banned in graphql, services, adapters; block split. |
| `tooling/guardrails.test.ts` | done | resolver/service/adapter → db rejected, repository → db allowed, adapter → service. |
| `.prettierignore` | done | |
| `.github/workflows/ci.yml` | done | Migration drift step (see R2 for what it cannot see). |
| `apps/api/test/helpers/secrets.ts` | done | See R1. |
| `apps/api/test/helpers/logs.ts` | done | `{ write }` destination at `trace` (logged deviation). |
| `apps/api/test/helpers/app.ts` | done | `{ db, execute, logs, close }`. |
| `apps/api/test/fixtures/property.ts` | done | |
| `apps/api/test/fixtures/weatherstack.ts` | done | Workspace-root walk-up (logged deviation). |
| `apps/api/test/helpers/*.test.ts`, `apps/api/test/fixtures/*.test.ts` | done | |
| `apps/api/vitest.unit.config.ts` | done | |
| `apps/api/test/integration/smoke.int.test.ts` | done | Edited in place; health via `createTestApp`, seed/count/reset case. |
| `context/test-plan.md` | done | Cookbook, *Test data*, TR-05/TR-06, new mutation target (see R3). |
| `CLAUDE.md` | done | Both commands in *Commands*. |
| `context/roadmap.md` | done | S-02 unknown resolved, RQ-02 resolved. |
| `pnpm-workspace.yaml` | unplanned | Logged under *Deviations* (`esbuild: false`). |
| `pnpm-lock.yaml` | unplanned | Follows the new dependencies. |
| `context/lessons.md` | unplanned | Lesson from the mutation step. |
| `context/changes/property-schema/{plan,plan-review,mutation}.md` | unplanned | Workflow artifacts. |

## Areas

| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | Every F-02 acceptance point is proven by `schema.int.test.ts`; the CLI exit codes and redaction are tested. |
| Design | ok | `src/db/**` is persistence-only and lint-enforced; one migration path (`runMigrations`) for tests and CLI. |
| Safety | ok | CLI never prints the URL or password; config error names the variable only. No secrets in the diff or the session exports. |
| Tests | concern | Behavioural and deterministic, but the TR-01 leak helper has a blind spot (R1). Mutation decisions are plausible. |
| Simplicity | ok | Small focused modules; no dead code. |
| Plan fidelity | concern | All planned files done; two artifact claims are inaccurate (R2, R3) and the session exports are misplaced (R4). |

## Findings

### R1: `expectNoSecret` misses a key in an Error's own fields or in `AggregateError.errors`
- Severity: major
- Where: `apps/api/test/helpers/secrets.ts:22-25`
- Problem: `revealErrors` replaces every Error with `{ name, message, stack, cause }` only, so
  every other own property is dropped before the search. Verified with a throwaway test:
  `expectNoSecret(Object.assign(new Error('weather failed'), { url: '/current?access_key=' + TEST_WEATHERSTACK_KEY }))`
  and `expectNoSecret(new AggregateError([new Error('k=' + TEST_WEATHERSTACK_KEY)], 'many'))`
  both pass without failing. The helper is the TR-01 safety net, and its own comment says to
  pass "an error". The S-01/S-02 adapter is the likely place for an error that carries the
  request URL in a field, and that leak would go unnoticed.
- Fix: serialise every own property of an Error, e.g.
  `Object.fromEntries(Object.getOwnPropertyNames(value).map((k) => [k, Reflect.get(value, k)]))`
  (this covers `message`, `stack`, `cause`, `errors` and custom fields), plus `name`. Add the
  two cases above to `secrets.test.ts`.
- Effort: small
- Decision: fix: `revealErrors` serialises every own property plus `name`; custom-field and `AggregateError` cases added to `secrets.test.ts` (fail on the old helper, pass now).

### R2: The migration drift step cannot detect a hand-edited migration, but the plan says it does
- Severity: minor
- Where: `.github/workflows/ci.yml:43-51`; claim in `context/changes/property-schema/plan.md:371-372`
- Problem: drizzle-kit compares `schema.ts` with `meta/*_snapshot.json`, not with the SQL.
  Verified on a scratch copy of `apps/api/drizzle/`: after changing the lat CHECK in the
  `.sql` to `BETWEEN -95 AND 95`, `drizzle-kit generate` printed "No schema changes, nothing
  to migrate" and wrote nothing, so the step would pass. The plan's *Risks* says "The CI drift
  step enforces it". In practice only `schema.int.test.ts` catches such an edit, and only for
  the constraints it tests.
- Fix: correct the claim in the plan (and the `schema.ts` comment, if wanted): the drift step
  catches schema changes that were not regenerated; a hand-edited SQL file is caught only by
  the schema integration tests. A stronger check (for example, a test that compares
  `information_schema`/`pg_constraint` with the snapshot) is not worth it for one table.
- Effort: small
- Decision: fix: plan *Risks* and the `schema.ts` comment now say what the drift step catches and that a hand-edited SQL file is caught only by `schema.int.test.ts`.

### R3: The test plan says migrate-cli is at "100% of non-equivalent", but 6 survivors are accepted, not equivalent
- Severity: minor
- Where: `context/test-plan.md:118`
- Problem: `mutation.md` records 3 equivalent survivors (`:15` ×2, `:34`) and 6 accepted
  ones (`:7` catch block, `:50-52` entry block ×5). The row says "Baseline 76.3% = 100% of
  non-equivalent; the 9 survivors are the entry-point block and unreachable fallbacks". The
  `:7` catch-block mutant is neither, and accepted is not equivalent. The decisions themselves
  are plausible; the summary overstates them, so the next run would compare against a wrong
  baseline.
- Fix: reword to "Baseline 76.3% (F-02); 3 survivors equivalent, 6 accepted (entry-point
  block, `decodedOrSelf` catch)", and either lower the target to match or keep it and note the
  accepted ones as exceptions.
- Effort: small
- Decision: fix: `test-plan.md` row reworded (3 equivalent, 6 accepted); target kept with the accepted survivors as exceptions.

### R4: F-02 session exports sit untracked in the repo root instead of `ai-sessions/`
- Severity: minor
- Where: repo root: `implement-F-02-{1,2,3}.txt`, `plan-F-02.txt`, `plan-review-F-02.txt`,
  `mutation-F-02.txt`, plus `merge-F-01.txt` and `mutation-F-01.txt`
- Problem: RQ-03 (`context/roadmap.md:234`) puts session exports in `ai-sessions/` as
  `NN-<change-id>-<step>.txt`. These are unnumbered, in the wrong place and not committed, and
  the AI setup is part of the deliverable. Two of them belong to F-01. A grep found no
  `access_key` values in them.
- Fix: move them to `ai-sessions/` with the next `NN-` numbers (after `17-review-F-01.txt`,
  F-01 ones first), and commit them with the review fixes.
- Effort: small
- Decision: fix: exports moved to `ai-sessions/18-…` – `25-…` (F-01 first) and committed with the review fixes.
