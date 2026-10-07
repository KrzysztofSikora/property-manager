# Plan review: repo-skeleton

Verdict: READY WITH NOTES

Second pass. The plan has absorbed all 11 findings from the first review (review #1–#11 are
cited in the plan). The findings below are new.

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Phasing | `.prettierignore` lists `context/`, `docs/`, `ai-sessions/`, `CLAUDE.md`, ... (plan:121–123) but not `.claude/`. `npx prettier@3 --check .claude/skills` flags all 10 `SKILL.md` files today. So `pnpm format:check` fails in CI (plan:336, Phase 5), and the editor hook would reformat a skill file whenever the agent edits one. | Add `.claude/` (or at least `.claude/skills/`) to `.prettierignore`. |
| 2 | major | Phasing / Grounding | The editor hook runs `node tooling/claude-format-hook.ts` (plan:204–205), but the plan itself says this Claude Code session runs Node v20.20.2 (plan:48–50; `node -v` confirms this). On Node 20 a `.ts` file throws `SyntaxError: Missing initializer in const declaration` (checked with a scratch file) and exits 1. Claude Code treats exit codes other than 2 as non-blocking, so the hook fails silently and the Phase 1 human check "the editor hook output is visible" (plan:375) cannot pass. Agent Bash calls don't keep shell state either, so every `pnpm`/`git commit` call needs Node 24 on its PATH. | Wrap the hook command in `sh` so it checks the Node major and exits 2 with "Node 24 required (run `nvm use`)", or have it select Node 24 itself. Use `"$CLAUDE_PROJECT_DIR"/tooling/...` so the path does not depend on the cwd. In the plan, say that each agent command runs with Node 24 (for example `source ~/.nvm/nvm.sh && nvm use >/dev/null && ...`). |
| 3 | major | Grounding / Design | `strictTypeChecked` with `projectService` (plan:146) applies to everything `eslint .` reaches. That includes `apps/*/vite.config.ts`, `apps/*/vitest*.config.ts`, `apps/api/test/**` and `apps/web/src/test/**`. The plan gives package tsconfig *options* (plan:135–139) but no `include`, and only the root tsconfig's coverage is stated (plan:140–142). A file outside every tsconfig throws "was not found by the project service", which is the same error the plan already handles for virtual paths (plan:170–173). Separately, `apps/web` sets `types: ["vite/client"]` and DOM libs, so `vite.config.ts` has no Node types there. | Give each package tsconfig an `include` (`src`, `test`, `*.config.ts`). For `apps/web`, add a small Node-typed tsconfig for its config files and reference it from the web `typecheck` script. Another option is `projectService.allowDefaultProject` for the `*.config.ts` files. |
| 4 | minor | Traceability | The Phase 2 human check says "The log line carries a `requestId`" (plan:408), but nothing logs per request. `main.ts` logs only `listening` (plan:246), and the context's child logger is never used. No test asserts that `requestId` reaches the context, although the roadmap F-01 scope asks for "pino with request id in context". | Have `health` (or a small Yoga plugin) log one line through `ctx.logger`. In `app.test.ts`, capture output with `createLogger(level, destination)` and assert that the line has a `requestId`. |
| 5 | minor | Phasing | The Design gives `vitest.unit.config.ts` `setupFiles: ['test/setup/msw.ts']` (plan:272–273), and Phase 2 creates that config (plan:380). `msw.ts` only arrives in Phase 3 (plan:416). | Say that the Phase 2 config has no `setupFiles`, and that Phase 3 adds it. |
| 6 | minor | Grounding | The Compose `postgres:18-alpine` service has "a named volume" (plan:325–326) with no mount path. In 18+ images, `PGDATA` is `/var/lib/postgresql/18/docker` and the image `VOLUME` is `/var/lib/postgresql` ([docker-library/postgres, PostgreSQL 18](https://deepwiki.com/docker-library/postgres/5.1-postgresql-18)). The usual `/var/lib/postgresql/data` mount does not hold the data. | Mount the volume at `/var/lib/postgresql`. |
| 7 | minor | Failure paths | CI step `pnpm codegen && git diff --exit-code` (plan:337) does not see new untracked generated files, for example a new client-preset file. | Fail when `git status --porcelain -- apps/api/src/graphql/generated apps/web/src/graphql` prints anything. |
| 8 | minor | Failure paths | The secret scan "checks only added lines (`+`) of a unified diff" (plan:179–180), but `git diff` header lines `+++ b/<path>` also start with `+`. The hook passes "staged files" to Prettier/ESLint (plan:200), and a staged deletion makes both tools fail on the missing path. | Skip `+++` headers, and add a test for it. Build the hook's file list with `git diff --cached --name-only --diff-filter=ACMR`. |
| 9 | minor | Scope | CI triggers on "push and pull_request" (plan:332), so every push to the PR branch runs the job twice. | Use `push: branches: [main]` plus `pull_request`. |
| 10 | minor | Phasing | "this plan, its review and the roadmap status edit ... are committed with phase 1" (plan:44–45). The implement skill stages "only the files on your list from step 3 plus `plan.md`" and leaves other dirty files alone (`.claude/skills/implement/SKILL.md:38`), so `plan-review.md` would be left out. | Add `context/changes/repo-skeleton/plan-review.md` and `context/roadmap.md` to the Phase 1 *Files* list. |

## What is good

- Every covered AC has an automated proof. FR-14 AC3 is proved through `loadConfig` and through
  a real process spawn, including the blank `.env.example` case. NFR-04 and NFR-06 are proved
  on every run by `tooling/guardrails.test.ts` with a control case. TR-25 has its own net-guard
  test.
- The end state is observable and specific: ports, exit codes, script names, CI steps and the
  test-plan sync are all named.
- Secret handling holds up. `ConfigError` uses its own wording, not zod's. The scanner prints
  only `file:line kind`, and its positive inputs are built at runtime. A count-only grep found
  no committed file that matches `access_key=[A-Za-z0-9]{16,}`, so the narrowed rule will not
  block existing artifacts.
- The first review's fixes are sound: two pattern objects for `regex`/`group`,
  `disableTypeChecked` for the virtual paths, root `typecheck` that includes the workspace root
  with fixtures excluded, `drizzle-orm*`/`pg` banned in services, and `retry: false` on the
  health query.
- The scope is tight. *Out of scope* matches the roadmap split. The extra pieces (Testcontainers
  smoke, API status line) are user decisions with reasons. The throwaway parts are named as
  such.
