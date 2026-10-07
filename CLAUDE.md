# Property Manager

Full-stack app for managing property records through a GraphQL API. Creating a property
calls the Weatherstack API (`/current`) once, to store the current weather and lat/long.
Brief: `docs/brief.txt`. Built AI-first; the AI setup is part of the deliverable.

## Process

Spec-driven workflow of project skills in `.claude/skills/`, described in
`docs/ai-workflow.md`. Every skill is invoked explicitly by the user. Do not skip steps or
start coding a roadmap item without an approved `context/changes/<id>/plan.md`.

## Artifacts (`context/`)

| File | Owner skill |
|------|-------------|
| `shape-notes.md` | `/shape` |
| `prd.md` | `/prd` |
| `tech-stack.md` | `/tech-stack` |
| `roadmap.md` | `/roadmap` |
| `test-plan.md` | `/test-plan` |
| `changes/<id>/{plan,plan-review,mutation,review}.md` | per-change skills |
| `lessons.md` | rules from reviews; read before planning, implementing and reviewing |

Artifacts are the source of truth. If code and an artifact disagree, raise it; don't
silently pick one.

## Rules

- **No secrets in code, commits, logs or answers.** Config comes from `.env` (template:
  `.env.example`). Never print the Weatherstack key; check only that it is set. Redact
  `access_key` in any logged URL or HTTP error.
- **No real Weatherstack calls in tests.** Use a fake adapter or HTTP-level mocks.
  The API is called only in the create-property mutation.
- **Layers:** resolver → service → repository / adapter. Resolvers map GraphQL to service
  calls; business logic lives in services; persistence in repositories; third-party HTTP in
  adapters. No layer skips the one below it.
- **Validate input with zod** at the boundary (mutation args, env config, external API
  responses) before it reaches a service.
- **TypeScript strict, no `any`.** Use `unknown` plus narrowing or zod parsing instead.
- Check library APIs against current docs (context7 MCP), not memory.
- One Conventional Commit per implemented phase.
- Commits reference their GitHub issue with `Refs #<n>`; the last commit of a roadmap item
  uses `Closes #<n>`. Issue numbers are in the `context/roadmap.md` Overview table.

## Mutation testing

- Run Stryker only on the targets listed in `context/test-plan.md`, scoped narrowly
  (single modules, not the whole repo).
- Every surviving mutant needs a recorded decision in `context/changes/<id>/mutation.md`:
  strengthen a test (real gap), or accept as equivalent / not worth killing, with a reason.
- Never change production code just to kill a mutant. Only tests change.
- The score is a pointer, not a target.

## Stack

Details and trade-offs: `context/tech-stack.md`.

- Node 24 (`.nvmrc`), pnpm 12 workspaces: `apps/api`, `apps/web`, `packages/shared`.
- API: GraphQL Yoga + graphql 17, SDL-first with GraphQL Code Generator; Drizzle ORM + `pg`
  on PostgreSQL 18; zod; native `fetch`; pino.
- Web: React 19 + Vite 8, React Router 8, TanStack Query, Tailwind 4.
- Tests: Vitest 5, Testing Library, MSW 3, Testcontainers, Playwright, StrykerJS.
- The API runs on Node type stripping (no tsx, no build): no enums or parameter properties,
  `import type` for types, local imports end in `.ts`. tsc and ESLint enforce this.
- TypeScript 6.0 (one compiler for tsc, typescript-eslint and the editor;
  TS 7 is blocked by typescript-eslint support).

## Commands

Run everything with Node 24. Each agent Bash call starts a fresh shell that may be on an
older Node, so prefix commands with `source ~/.nvm/nvm.sh && nvm use >/dev/null && ...`.
The pre-commit hook fails with "Node 24 required" otherwise.

| Task | Command |
|------|---------|
| Install (also sets `core.hooksPath` to `.githooks`) | `pnpm install` |
| Database for dev | `docker compose up -d postgres` |
| Dev servers (API `:4000/graphql`, web `:5173`) | `pnpm dev` (needs `WEATHERSTACK_KEY` in `.env`) |
| Hermetic tests (no Docker; pre-commit runs these) | `pnpm test:unit` |
| All tests incl. Testcontainers integration (Docker running) | `pnpm test` |
| One Vitest project | `pnpm vitest run --project api-unit` (`shared`, `api-unit`, `api-int`, `web`, `tooling`) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Format / check | `pnpm format` / `pnpm format:check` |
| GraphQL codegen (commit the output) | `pnpm codegen` |
| Mutation (one module, targets in `context/test-plan.md`) | `pnpm --filter @property-manager/api test:mutation --mutate src/<module>.ts` |
| E2E | not yet (S-06) |
