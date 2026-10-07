# Review: repo-skeleton

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 55 passed / 0 failed (10 files, incl. `api-int` with
Testcontainers). Also: `format:check` ok; CI run on HEAD `aa463d0` (PR #14) green.

Base: `a25205e^` (parent of the first `(repo-skeleton)` commit). `context/lessons.md` does not
exist yet. No `mutation.md`: F-01 owns no mutation target in `context/test-plan.md`.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | done | Scripts, `engines`, `engineStrict`; `allowBuilds` denies logged (phase 3). |
| `tsconfig.base.json`, `tsconfig.json` | done | Flag set as designed; root excludes `tooling/fixtures`. |
| `eslint.config.ts`, `.prettierrc.json`, `.prettierignore` | done | `restrictImports` + layer table match; react-hooks config logged (phase 4). |
| `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,stryker.config.json}` | done | `allowEmpty` logged. |
| `vitest.config.ts` (root) | done | Five projects; `test:unit` excludes `api-int`. |
| `tooling/guardrails.test.ts`, `tooling/fixtures/*` | done | NFR-04 / NFR-06 cases plus control case. |
| `tooling/secret-scan.ts`, `secret-scan-cli.ts`, `secret-scan.test.ts` | done | `formatLeaks` logged. See R2. |
| `.githooks/pre-commit` | done | See R3. |
| `tooling/claude-format-hook.{sh,ts}`, `.claude/settings.json` | done | Node guard exits 2 as designed. |
| `apps/api/{package.json,tsconfig.json,schema.graphql,vitest.unit.config.ts}` | done | |
| `codegen.ts`, `apps/api/src/graphql/generated/resolvers-types.ts` | done | `contextType` with `.ts` logged. See R1. |
| `apps/api/src/config/env.ts`, `env.test.ts` | done | Own wording; empty = unset. |
| `apps/api/src/logger.ts` | done | |
| `apps/api/src/graphql/{context.ts,resolvers.ts}`, `src/app.ts`, `src/main.ts` | done | Envelop narrowing and `createServer` wrapper logged. See R4. |
| `apps/api/src/main.test.ts`, `app.test.ts`, `net-guard.test.ts`, `test/setup/msw.ts` | done | |
| `apps/api/vitest.int.config.ts`, `test/setup/postgres.ts`, `test/integration/smoke.int.test.ts` | done | Extra TR-25 case logged. |
| `apps/api/stryker.config.json` | done | `plugins` logged. |
| `docker-compose.yml` | done | Volume at `/var/lib/postgresql`. |
| `apps/web/{package.json,tsconfig.json,tsconfig.node.json,vite.config.ts,vitest.config.ts,index.html}` | done | Solution-style `tsconfig.json` logged. |
| `apps/web/tsconfig.app.json` | unplanned | Logged under *Deviations* (phase 4). |
| `apps/web/src/{main.tsx,index.css}`, `src/app/{routes.tsx,Layout.tsx}`, `src/pages/*` | done | Four routes incl. catch-all. |
| `apps/web/src/app/routes.test.tsx` | unplanned | Implied by phase 4 *Proves* (route headings); not listed as a file. |
| `apps/web/src/lib/execute.ts`, `execute.test.ts` | done | `isResultOf` predicate logged. |
| `apps/web/src/components/ApiStatus.tsx`, `ApiStatus.test.tsx` | done | `retry: false`, `role="status"`. |
| `apps/web/src/graphql/*` | done | Client-preset output committed. See R1. |
| `apps/web/src/test/{setup.ts,msw.ts,render.tsx}` | done | `graphql.link` logged. |
| `.github/workflows/ci.yml` | done | Triggers, concurrency, drift check with porcelain, sentinel key. |
| `.env.example` | done | All five variables, only the key required. |
| `CLAUDE.md` | done | *Commands* filled in, incl. the `nvm use` note. |
| `context/test-plan.md` | done | `onUnhandledFrame`, scan rule, config names, projects, TR-18/22/23/25 covered. |
| `context/roadmap.md` | done | `onUnhandledFrame` wording; status set to `review` by this review. |
| `context/changes/repo-skeleton/{plan.md,plan-review.md}` | done | Committed in phase 1 as planned. |
| `.gitignore` | unplanned | `.stryker-tmp/`, logged (phase 3). |
| `ai-sessions/10..15-*.txt` | unplanned | Not in the plan or *Deviations*. See R5. |
| `implementation-F01-5.txt` (untracked, repo root) | unplanned | See R5. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | FR-14 AC3, NFR-04, NFR-06 proven by tests; empty-is-unset and defaults correct. |
| Design | ok | Composition root, layer globs and config boundary match the plan; `.ts` imports throughout. |
| Safety | concern | No secret in code or session exports (scanned, key never printed); scan has a narrow parsing gap (R2) and the hook lints working-tree content (R3). |
| Tests | ok | Behavioural assertions, failure paths (500, errors payload, network error, invalid env), MSW guard proven by cause. |
| Simplicity | concern | One dead codegen hook (R1). |
| Plan fidelity | ok | All planned files present; deviations logged, except the session exports (R5). |

## Findings
### R1: Codegen `afterAllFileWrite: prettier --write` is a no-op
- Severity: minor
- Where: `codegen.ts:26`, `.prettierignore:7-8`
- Problem: The plan adds the hook "so the output is deterministic for the drift check". Both
  output paths (`**/generated/`, `apps/web/src/graphql/`) are in `.prettierignore`, and
  Prettier skips ignored files even when they are passed explicitly:
  `prettier --check apps/web/src/graphql/graphql.ts` reports "All matched files use Prettier
  code style", while the same check with `--ignore-path /dev/null` exits 1. The committed
  output is unformatted. Drift detection still works because codegen is deterministic, so the
  hook is dead config that suggests a guarantee it does not give.
- Fix: Remove the hook (codegen output is already deterministic and excluded from format
  checks). Alternative: keep it and call `prettier --write --ignore-path /dev/null` so the
  generated files really are formatted.
- Effort: small
- Decision: fix: hook removed from `codegen.ts`; `pnpm codegen` shows no drift.

### R2: Secret scan treats an added line starting with `++ ` as a file header
- Severity: minor
- Where: `tooling/secret-scan.ts:17-20`
- Problem: Any diff line starting with `+++ ` resets `file` and is skipped. An added line whose
  content starts with `++ ` is emitted by git as `+++ ...`, so it is never scanned. Verified
  with a key-like `access_key=` + 32 chars: the normal line yields 1 leak, the same text after
  `++ ` yields 0. Rare in practice, but it is a silent bypass of the commit gate for TR-01.
- Fix: Only accept a `+++ ` header right after a `--- ` line (or between `diff --git` and the
  first `@@`); inside a hunk, treat every `+` line as content. Add a table row for it in
  `secret-scan.test.ts`.
- Effort: small
- Decision: fix: header only between `diff --git` and `@@`; test `scans an added line whose content starts with "++ "` (failed first, now passes).

### R3: Pre-commit formats and lints the working tree, not the staged content
- Severity: minor
- Where: `.githooks/pre-commit:16-19`
- Problem: The hook passes staged file *paths* to Prettier and ESLint, which read the files
  from disk. With partial staging (`git add -p`) the check runs on unstaged content: a
  badly formatted staged hunk passes if the working copy was fixed afterwards, and a clean
  staged hunk fails because of unstaged edits. The secret scan is not affected (it reads
  `git diff --cached`). CI's full `lint` / `format:check` catches the first case later.
- Fix: Document that the gate checks the working tree (simplest). Alternative: reject commits
  with unstaged changes in staged files (`git diff --name-only` ∩ staged list), or check via
  `git show :<path> | prettier --stdin-filepath <path>`.
- Effort: small
- Decision: fix: pre-commit exits 1 and lists staged files that also have unstaged changes (checked by hand with a partially staged scratch file).

### R4: Requests that fail parsing or validation produce no `graphql operation` log line
- Severity: minor
- Where: `apps/api/src/app.ts:37-54`
- Problem: The plan says the plugin logs "one `graphql operation` line per request". It hooks
  only `onExecute`, which Yoga never reaches for a parse error or a validation error. Verified
  in process with a `trace` logger: `{ nope }` and `{ health ` both return 200 with 0 log
  lines. Invalid client queries are therefore invisible in the logs, although the request got
  a `requestId`.
- Fix: Also log from `onParse` / `onValidate` failures (or use Yoga's `onResponse` with the
  context's logger), with `operationName: null` and an outcome field; add a test for an
  invalid query. Alternative: narrow the plan wording to "per executed operation" and accept
  it.
- Effort: small
- Decision: fix: `onParse` / `onValidate` failures log one line with `outcome` and a fresh `requestId`; `app.test.ts` covers both cases.

### R5: Session exports are outside the plan, and one is left untracked at the repo root
- Severity: minor
- Where: `ai-sessions/10-plan-F-01.txt` … `15-implement-F-01-4.txt` (commit `06beb26`),
  `implementation-F01-5.txt` (untracked)
- Problem: The six committed session exports are not in the plan's files or *Deviations*.
  `implementation-F01-5.txt` sits untracked in the repo root, outside `ai-sessions/` and its
  `NN-` naming, so it will either be lost or committed in the wrong place. All seven files
  were scanned with `findSecretLeaks` against the `.env` key and the key-like rule: no leaks,
  no 32-hex tokens.
- Fix: Move it to `ai-sessions/16-implement-F-01-5.txt` and commit it with `Refs #1` (or delete
  it), and add one *Deviations* line that phase commits also carry the session exports.
- Effort: small
- Decision: fix: moved to `ai-sessions/16-implement-F-01-5.txt`; *Deviations* line added to the plan.
