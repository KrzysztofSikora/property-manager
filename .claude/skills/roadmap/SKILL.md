---
name: roadmap
description: Break the PRD into enabling foundations (F-xx) and end-to-end vertical slices (S-xx), ordered by risk and dependency. Produces context/roadmap.md. Run after /tech-stack.
disable-model-invocation: true
---

# Build the roadmap

## Input

- `context/prd.md` and `context/tech-stack.md` (both required).

## Concepts

- **Foundation (F-xx):** work with no user-visible value on its own that unblocks slices, such
  as the repo skeleton, the DB schema or CI. Keep foundations few and thin.
- **Slice (S-xx):** a vertical piece that works end to end (API, persistence and, where
  relevant, UI) and that a user or reviewer can see working.
- **change-id:** a kebab-case name for the intent of an item, e.g. `create-property-with-weather`.
  It names the folder `context/changes/<change-id>/`.

## Process

1. Map every **Must** FR to the slice that delivers it. Split a slice that covers too much to
   finish and verify in one focused session.
2. Pull the riskiest work early: unknown third-party behaviour, schema decisions that are hard
   to change, and anything the other slices depend on.
3. Add only the foundations the first slices really need.
4. For each item record its goal, covered FRs, dependencies, acceptance criteria, unknowns and
   size (S, M or L).
5. Check coverage: no Must FR is left without an item. Should and Could FRs go to *Later*.

## Output: `context/roadmap.md`

```markdown
# Roadmap

## Overview
| ID | change-id | Type | Covers | Depends on | Size | Status |
|----|-----------|------|--------|------------|------|--------|
| F-01 | repo-skeleton | foundation | - | - | S | todo |
| S-01 | ... | slice | FR-01, FR-02 | F-01, F-02 | M | todo |

## Items
### S-01 <title> (`<change-id>`)
- Goal:
- Covers:
- Depends on:
- Acceptance: (refer to PRD AC IDs, do not copy them)
- Unknowns:
- Size:

## Later
## Open roadmap questions
```

## Rules

- The status column is the single source of progress: `todo`, `planned`, `in-progress`,
  `review` or `done`. Later skills update it.
- Prefer vertical slices. If you choose a horizontal layer, write down why.
