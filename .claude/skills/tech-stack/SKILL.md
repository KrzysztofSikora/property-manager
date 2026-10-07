---
name: tech-stack
description: Choose the technology stack from the PRD through explicit trade-offs, current documentation and a devil's-advocate check. Produces context/tech-stack.md. Run after /prd.
disable-model-invocation: true
---

# Select the tech stack

## Input

- `context/prd.md` (required), especially *Constraints* and *Non-functional requirements*.
- Any stack the user already prefers. Treat it as one option, not as the answer.

## Process

1. **List the decision areas** the PRD actually needs, for example: runtime and package
   manager, API layer and schema approach, persistence and data access, validation, outbound
   HTTP, frontend framework and data fetching, styling, testing (unit, integration, e2e),
   tooling (lint, format, typecheck), and local run and containers. Do not invent areas the
   PRD does not need.
2. **For each area**, compare 2-3 realistic options against these criteria:
   - fit to the PRD and its constraints,
   - end-to-end type safety,
   - simplicity: fewest moving parts that meet the requirements,
   - maturity and maintenance status,
   - how easily a reviewer can read and run it.
3. **Verify instead of remembering.** Check current major versions and recommended setup with
   the context7 MCP server, or with the official docs. Note the version you verified.
4. **Argue against yourself.** For each pick, write the strongest case for the runner-up. Keep
   the pick only if you can answer that case.
5. **Check the whole stack fits together.** Code generation, the module system (ESM or CJS),
   the test runner and tsconfig settings must work together.
6. Present the summary to the user, then write the file after they confirm.

## Output: `context/tech-stack.md`

```markdown
# Tech stack

## Summary
| Area | Choice | Version | Why (one line) |
|------|--------|---------|----------------|

## Decisions
### <Area>
- Options considered: ...
- Chosen: ... because ...
- Strongest case against: ... and why we still accept it
- Revisit if: ...

## Architecture sketch
<layers and dependency direction, e.g. resolver -> service -> repository / adapter>

## Local development
<what `docker compose up` / `pnpm dev` will start>
```

## Rules

- Prefer boring, well-documented tools. Novelty must earn its place.
- Do not add a dependency for something the platform or a chosen library already does.
