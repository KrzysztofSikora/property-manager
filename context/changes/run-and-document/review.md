# Review: run-and-document

Verdict: APPROVE
Gates: typecheck ok, lint ok, format:check ok, tests 573 passed / 0 failed (39 files, incl.
Testcontainers), `pnpm e2e` 2 passed / 0 failed (stack torn down, no `property-manager-e2e`
containers left)

Base: `886a724` (parent of `c50456a`), head `529a110` plus the uncommitted plan tick,
`mutation.md` and the S-06 session exports at the repo root.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/api/Dockerfile` | done | fetch + offline filtered install, workspace layout kept, `--ignore-scripts`, migrate then `exec` start. `package.json` before fetch is a logged deviation. |
| `apps/web/Dockerfile` | done | Multi-stage Vite build, `nginx:1.30-alpine` runtime. |
| `apps/web/nginx.conf` | done | SPA fallback and `/graphql` proxy to `api:4000`. |
| `.dockerignore` | done | `.env*` (except `.env.example`), `node_modules`, `.git` excluded. `**/dist`, `**/reports` logged. |
| `docker-compose.yml` | done | `api` and `web` as designed. `127.0.0.1` healthchecks and `${VAR:-}` passthrough logged. |
| `.prettierignore` / ESLint ignores | absent | Conditional in the plan ("only if the new files trip them"); not needed, gates pass. |
| `e2e/stub/server.ts` | done | `/current`, `QUOTA` → 104, `/healthz`, 404; logs method, path and status only. |
| `e2e/stub/README.md` | done | Trigger table. |
| `docker-compose.e2e.yml` | done | Stub, placeholder key, `!reset` / `!override` ports. Directory mount logged. |
| `e2e/playwright.config.ts` | done | Trace setting logged as deviation. |
| `e2e/global-setup.ts`, `e2e/global-teardown.ts` | done | |
| `e2e/compose.ts` | unplanned | Logged under *Deviations*; shared compose arguments and `cwd`. |
| `e2e/helpers.ts` | done | Adds `fountainHills` and `submitCreateForm` next to `uniqueStreet`. |
| `e2e/property-journey.spec.ts`, `e2e/create-errors.spec.ts` | done | See R1 for what the journey can actually detect. |
| `e2e/tsconfig.json` | absent | Logged: root `tsconfig.json` `include` used instead (the plan's second option). |
| `tsconfig.json` | done | `e2e/**/*.ts` added. |
| `vitest.config.ts` / Vitest configs | absent | Logged: no change needed; `pnpm test` still collects 39 files, none from `e2e/`. |
| `package.json`, `pnpm-lock.yaml` | done | `e2e` script, `@playwright/test ~1.63.0`. |
| `.github/workflows/ci.yml` | done | `e2e` job, `needs: check`, no secrets, report on failure. See R2. |
| `README.md` | done | Every FR-14 AC2 item present; all relative links resolve (script check). See R3. |
| `CLAUDE.md` | done | Full-stack and E2E rows. |
| `context/test-plan.md` | done | TR-24 covered, cookbook updated. TR-08/16/17 flip logged. |
| `context/roadmap.md` | done | Naming text and RQ-03 corrected. |
| `docs/ai-workflow.md` | done | Session export line. |
| `context/changes/run-and-document/{plan,plan-review,mutation}.md` | done | Workflow artifacts. `mutation.md` exists although *Scope* puts `/mutation` out; it records "no targets", which is consistent. |
| `*-S-06.txt` (repo root, untracked) | unplanned | Session exports not yet moved to `ai-sessions/`; see R3. No key value found in them. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | `docker compose up` stack and e2e run green; FR-14 AC1/AC2 and FR-15 AC1 met; FR-15 AC2 pending the closing commit, as planned. |
| Design | ok | Separate Compose project for e2e, stub via override file, no API/UI changes. |
| Safety | ok | `.env` excluded from build contexts, placeholder key in e2e, stub never logs the query string, CI has no secrets. |
| Tests | concern | The journey spec cannot fail on sort order or on a filter that is ignored (R1). |
| Simplicity | ok | Small, well-commented files; `compose.ts` removes duplication between setup and teardown. |
| Plan fidelity | ok | Every divergence is logged under *Deviations*. |

## Findings
### R1: The e2e journey cannot detect wrong sort order or an ignored city filter
- Severity: minor
- Where: `e2e/property-journey.spec.ts:22-30`
- Problem: every run starts on an empty volume, and `create-errors.spec.ts` stores nothing
  (quota error). So the journey's list holds exactly one property. `getByRole('row').nth(1)`
  is that property whatever the sort order, and the city filter "keeps it" even if the filter
  is never sent to the API. The comment and TR-24 ("list shows it newest first → filter by
  city") claim more than the spec can fail on. Lower layers do cover sorting (TR-14) and
  filter arguments (TR-13, web tests), so this is a smoke-test gap, not a missing guard.
- Fix: at the start of the spec, create a second property in a different city with state `AZ`
  (the stub always answers region Arizona), e.g. `Scottsdale`, before the main one. Then assert
  the main one is row 1 and the other row 2, and that after the `Fountain Hills` filter the
  Scottsdale row is gone. Alternatively, reword the comment and TR-24 to "appears in the list"
  and leave ordering to TR-14.
- Effort: small
- Decision: fixed — a Scottsdale property is created first; the spec asserts both rows in order and that the filter drops Scottsdale. Swapping the expected rows makes the spec fail.

### R2: A failed stack start in CI leaves no container logs
- Severity: minor
- Where: `e2e/global-setup.ts:4-6`, `e2e/global-teardown.ts:5-8`, `.github/workflows/ci.yml:74-80`
- Problem: if `up -d --build --wait` fails (e.g. a migration error makes `api` exit), Compose
  only reports which container is unhealthy. Playwright then still runs global teardown
  (checked with a throwaway config: teardown runs after a throwing `globalSetup`), which runs
  `down -v` and deletes the containers. The CI job uploads only `playwright-report/`, which is
  empty in that case. The cause of a start-up failure in CI is lost.
- Fix: in `global-setup.ts`, wrap the `up` call in `try`/`catch`, run
  `compose('logs', '--no-color')` in the `catch`, then rethrow. The logs land in the job output
  before teardown removes the containers. (A CI `if: failure()` step alone would run too late,
  after `down -v`.)
- Effort: small
- Decision: fixed — `global-setup.ts` prints `compose logs` before rethrowing (the logs call is best-effort, so the start-up error is kept).

### R3: S-06 exports are at the repo root and the README row marks `/mutation` as not run
- Severity: minor
- Where: `README.md:204`, `README.md:193`, untracked `plan-S-06.txt`, `plan-review-S-06.txt`,
  `implement-S-06-{1,2,3}.txt`, `mutation-S-06.txt`
- Problem: the exports exist but are not in `ai-sessions/` and have no `NN-` prefix, so they
  do not follow the documented `NN-<step>-<ROADMAP-ID>[-n].txt` name. The README's S-06 row
  shows `– ³` for Mutation, and the legend says `–` means "the step did not run"; `/mutation`
  did run (`mutation.md`, `mutation-S-06.txt`). FR-15 AC2 is only met once these are fixed;
  the plan already defers that to the closing commit, so this is a checklist item for it.
- Fix: in the `Closes #8` commit, move the files to `ai-sessions/` as `62-plan-S-06.txt`,
  `63-plan-review-S-06.txt`, `64`–`66-implement-S-06-{1,2,3}.txt`, `67-mutation-S-06.txt`,
  then the review export, and link each in the S-06 row. Change the Mutation cell to the link,
  with footnote ³ reworded to "no mutation target touched".
- Effort: small
- Decision: fixed — exports moved to `ai-sessions/62`–`68`, linked in the S-06 row; the Mutation cell links 67 with footnote ² "no mutation target".
