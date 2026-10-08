# Plan review: run-and-document

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Grounding | *Design*: "`e2e/playwright.config.ts`: `testDir` `e2e`". Playwright resolves `testDir` relative to the config file, so this points at `e2e/e2e` and `pnpm e2e` finds no tests. | `testDir: '.'` (or leave it out) and keep `e2e/stub/**` out of `testMatch` (the default `*.spec.ts` already does). |
| 2 | major | Traceability | The roadmap's S-06 *Acceptance* says "PRD success criteria 1–7 walk-through" (`context/roadmap.md:206`). The plan covers criteria 1–3 and the quota part of 4 (Phase 2 *Proves*). Phase 3's human check walks only criterion 1. Criteria 4 (validation, duplicate), 5, 6 and 7 are never walked through. | Add a Phase 3 human check (or a short checklist in the final review) that walks criteria 1–7 and points to the existing proof for each: tests for 4, `pnpm lint/typecheck/test` for 5, the README AI section for 6, and the test-plan TR table for 7. |
| 3 | minor | Grounding | Root `package.json` has `"prepare": "git config core.hooksPath .githooks"`. `.dockerignore` drops `.git`, and `node:24-alpine` has no `git`. If pnpm runs the root `prepare` during the in-image install, the API and web builds fail. *Risks* covers only the fetch/offline fallback. | In both Dockerfiles, use `pnpm install … --ignore-scripts` (`allowBuilds` in `pnpm-workspace.yaml` already turns off every native build), or check that the filtered install skips root lifecycle scripts. |
| 4 | minor | Grounding | Web build stage: "installs the web and shared deps … runs `pnpm --filter @property-manager/web build`". `apps/web/tsconfig.app.json` extends `../../tsconfig.base.json`, and Vite reads the tsconfig when it transforms. The API image copies only "root `package.json`, `apps/api` and `packages/shared`". | Name `tsconfig.base.json` in the web build stage's COPY list. The API image doesn't need it at runtime. |
| 5 | minor | Design | "healthcheck on /health" for `api`, plus "every service needs one" (*Risks*), but no tool is named. `node:24-alpine` has no `curl`. | Name the command: busybox `wget -qO- http://localhost:4000/health` or `node -e "fetch(…)"`. Use `wget` for nginx and the stub too. |
| 6 | minor | Scope | Phase 3 updates only "the session-naming text" in the roadmap, but the old pattern `NN-<change-id>-<step>.txt` also appears in RQ-03 (`context/roadmap.md:236-237`). | Fix both places, or note in RQ-03 that it is superseded. |
| 7 | minor | Phasing | The Phase 1 agent check publishes 4000/5173 on the dev project. If `pnpm dev` is running it clashes, and it runs migrations against the dev volume. | State the precondition ("stop `pnpm dev` first"). Migrating the dev DB is fine, but say so. |
| 8 | minor | Design | `global-setup.ts` runs `docker compose -f docker-compose.yml …` with relative paths. Playwright runs global setup from the cwd where `pnpm e2e` was invoked, which is the root in practice, but that is implicit. | Resolve the compose file paths from `import.meta.dirname` (or set `cwd` on the spawn). |

## Checks with no finding

- **Grounding:** these are all real and match the plan: `docker-compose.yml:1-20`,
  `env.ts` (empty counts as unset, "Missing required environment variable: …"),
  `migrate.ts:6-7` (cwd-independent), `client.ts:39-43` (`/current`, `access_key`, `query`, `units=f`),
  `execute.ts:41` (`fetch('/graphql')`), `vite.config.ts:10` (proxy), `resolvers.ts:17` (`health`),
  `main.ts:43` (`'listening'`), `main.ts:16` (exit 1), the sample's `region: "Arizona"`, and the
  `ai-sessions/` naming (`27-plan-S-01.txt`, no plan-review for F-01). `weatherQuery`
  (`property.service.ts:21`) puts the street in `query`, so a `QUOTA` street reaches the stub.
- **Failure paths:** these are covered. Missing key: F-01 tests plus the Compose check. Quota:
  e2e spec. The validation, duplicate and HTTP errors are already covered by unit and integration
  tests, and the plan rightly adds no API behaviour.
- **Unknowns:** none is BLOCKING. Both open risks (fetch/offline, `GET /health`) have a fallback.
- **Lessons:** nothing contradicts them. No mutation step, which matches test-plan *Mutation targets*.

## What is good

- The secret handling is careful. Compose uses `${WEATHERSTACK_KEY:-}`, so a missing key fails
  fast in the API. The e2e stack overrides the key with a placeholder, so the real key never
  reaches the stub. The stub doesn't log the URL. `.dockerignore` keeps `.env` out.
- The `pnpm deploy` / type-stripping trap under `node_modules` is caught. The plan's answer is
  an invariant: keep the workspace layout.
- The e2e stack is isolated: its own project name, `!reset` ports, a fresh volume and `down -v`.
  It is started from `globalSetup` rather than `webServer`, which avoids the SIGKILL issue.
- The session-naming discrepancy is raised against the artifact rather than papered over.
