---
name: prd
description: Turn the brief and shape notes into a testable product requirements document with traceability back to the brief. Run after /shape.
argument-hint: "[path-to-brief]"
disable-model-invocation: true
---

# Write the PRD

The PRD is the contract every later step points to. It says **what** is built and **how we
know it works**. It does not say how it is built.

## Input

- The brief (`$ARGUMENTS`, or the path recorded in `context/shape-notes.md`).
- `context/shape-notes.md`. If it is missing, tell the user to run `/shape` first, and stop.

## Process

1. Pull every requirement out of the brief. Number them as the brief does (`B-1`, `B-7c`, ...).
2. Write user stories and functional requirements. Each FR gets:
   - a priority: **Must** (in the brief or blocking a Must), **Should**, or **Could**;
   - acceptance criteria in Given / When / Then form, concrete enough to become a test.
3. Fold in the decisions, assumptions and non-goals from the shape notes, citing their IDs.
4. Describe each external integration as a contract: request, the response fields we use,
   error cases, and limits. Mark anything unverified as `UNVERIFIED`.
5. Run the self-check below and fix every gap before saving.

## Output: `context/prd.md`

```markdown
# PRD: <project>

## Problem and goal
## Users
## Constraints            <!-- mandated by the brief: language, framework, delivery -->
## User stories           <!-- US-01 ... with the brief reference -->
## Functional requirements
### FR-01 <name>  (Must, covers US-01, B-1)
- AC1: Given ... When ... Then ...
## Data model (conceptual)  <!-- fields, formats, validation; no DB or ORM terms -->
## External integrations
## Non-functional requirements
## Non-goals
## Success criteria       <!-- how a reviewer decides the scope is complete -->
## Traceability
| Brief | Story | FR | Notes |
|-------|-------|----|-------|
## Open questions
```

## Self-check (all must hold)

- [ ] Every brief requirement appears in the traceability table.
- [ ] Every Must FR has at least one acceptance criterion you could automate.
- [ ] No acceptance criterion uses vague words like "fast", "nice" or "properly" without a
      measurable meaning.
- [ ] No framework, library or database names, except those listed under *Constraints*.
- [ ] Every non-goal is stated explicitly, not implied.
