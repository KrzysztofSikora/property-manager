# Mutation check: run-and-document

Targets: none · Tests: none run
Score: n/a (Stryker not run)

S-06 (`886a724...ce03f58`) touches no module in `context/test-plan.md` *Mutation targets*, and
`plan.md` *Scope* puts a `/mutation` step out of scope for that reason. The changed files and
why none is a target:

| Files | Why not mutated |
|-------|-----------------|
| `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf`, `docker-compose*.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `package.json`, `tsconfig.json` | Configuration. Stryker cannot mutate it; the e2e job exercises it. |
| `e2e/stub/server.ts` | Test tooling, not production code. No hermetic test runs it, so Stryker would report "no tests ran". A fault in it (wrong path, quota trigger, sample body) fails the e2e journeys, which is where it is guarded. |
| `e2e/compose.ts`, `e2e/global-*.ts`, `e2e/helpers.ts`, `e2e/*.spec.ts`, `e2e/playwright.config.ts` | Test code and wiring. |
| `README.md`, `CLAUDE.md`, `docs/`, `context/` | Documentation. |

## Mutants

None.

## Dead-weight tests

None reviewed: no hermetic tests were added in S-06.

## Gaps for the test plan

None. The stub is guarded by the e2e suite (TR-24); adding it to *Mutation targets* would need
a hermetic test for test tooling, which costs more than the faults it would catch.
