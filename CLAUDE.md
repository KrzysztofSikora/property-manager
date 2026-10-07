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

## Mutation testing

- Run Stryker only on the targets listed in `context/test-plan.md`, scoped narrowly
  (single modules, not the whole repo).
- Every surviving mutant needs a recorded decision in `context/changes/<id>/mutation.md`:
  strengthen a test (real gap), or accept as equivalent / not worth killing, with a reason.
- Never change production code just to kill a mutant. Only tests change.
- The score is a pointer, not a target.

## Stack

TODO: fill in after `/tech-stack` (`context/tech-stack.md`).

## Commands

TODO: fill in after F-01 (install, dev, test, lint, typecheck, mutation, e2e).
