---
name: plan
description: Research the codebase and docs for one roadmap item, settle open design choices with the user, then write a phased, verifiable implementation plan in context/changes/<change-id>/plan.md. Writes no production code.
argument-hint: "<change-id | roadmap ID>"
disable-model-invocation: true
---

# Plan one change

## Input

- `$ARGUMENTS`: a change-id or roadmap ID (e.g. `S-01`). Resolve it in `context/roadmap.md`.
  If the item does not exist, stop and say so.
- `context/prd.md`, `context/tech-stack.md`, `CLAUDE.md`, and if present
  `context/test-plan.md` and `context/lessons.md`. Treat every lesson as a constraint on the
  design.
- An existing `plan.md` for this change means refine mode: keep the ticked progress and edit
  only what the user asks for.

## Process

### 1. Research (no questions yet)

- **Inside the repo:** find the files, patterns and conventions this change touches. For broad
  searches, delegate to an Explore subagent and ask for conclusions with `file:line`
  references, not file dumps.
- **Outside the repo:** check library APIs and third-party behaviour with context7 or the
  official docs. Record anything surprising under *Findings*.

### 2. Decide with the user

List the choices that research could not settle and that change the outcome: behaviour on
failure, data shape, API contract, UX. Leave out anything the PRD, tech stack, lessons or
existing code already decide. Then:

- Ask at most **6 questions**, in rounds of up to 3, using the AskUserQuestion tool.
  A small change may need none. Say so and skip this step.
- Put your preferred option first, mark it "(suggested)", and give each option one line on
  what it buys and one on what it costs.
- Record every answer in *Decisions*. Never ask about something you can find out by reading
  code or docs.

### 3. Agree on the shape

Show the phases as a numbered list, one line each (what it delivers and how it is proven).
Ask whether to proceed, merge phases or split them. Write the full plan only after the user
agrees.

### 4. Write the plan

Each phase must:
- leave the repo building, with tests green;
- be small enough to review as one diff;
- name the files it touches, with the intent of each change and the contract it affects
  (a signature, schema field, route or invariant). Leave the code itself to `/implement`;
- split its exit criteria into **agent checks** (commands the agent runs) and **human checks**
  (things a person must look at: UI, real API behaviour, wording).

Mark each unknown as resolved, or as `BLOCKING` and ask about it before you finish. Then set
the roadmap status to `planned`.

## Output: `context/changes/<change-id>/plan.md`

```markdown
# Plan: <change-id> (<roadmap ID>)

## Goal and end state
<what is observably true when done; refer to PRD AC IDs>

## Scope
- In:
- Out:

## Findings
<current state with file:line refs; library and API facts with sources>

## Decisions
| Question | Answer | Why | Decided by (user / research / lesson) |

## Design
<interfaces, schema, data flow, error model>

## Phases
### Phase 1: <name>
- Files:
  - `path/file.ts`: <intent>. Contract: <signature, field or invariant>
- Proves: <AC IDs and the test level used>
- Agent checks: `pnpm typecheck`, `pnpm test -- <scope>`
- Human checks: <or "none">

## Risks and unknowns

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [ ] Phase 1: <name>
- [ ] Phase 2: <name>

## Deviations
<filled during implementation>
```

## Rules

- Only short snippets, and only where prose would be ambiguous (a regex, an unusual API call).
- Every PRD AC this item covers must be proved by a test in some phase.
- Prefer the simplest design that meets the ACs. Name any pattern you introduce and say why.
- End by telling the user the next step: `/plan-review <change-id>`.
