---
name: plan-review
description: Independent readiness review of a change plan before any code is written. Runs in a fresh context and writes context/changes/<change-id>/plan-review.md with a verdict.
argument-hint: "<change-id>"
disable-model-invocation: true
context: fork
---

# Review a plan before implementation

You did not write this plan. Read it as a skeptical reviewer whose job is to find what would
make implementation go wrong. Do not edit `plan.md`.

## Input

- `context/changes/$ARGUMENTS/plan.md` (required).
- `context/prd.md`, `context/roadmap.md`, `context/tech-stack.md`, `CLAUDE.md`,
  `context/lessons.md` (if present).

## Checks

1. **Traceability:** the plan answers its roadmap item, and every covered AC is proved by a test.
2. **End state:** the end state is concrete and observable, not "implement X".
3. **Grounding:** every existing file, symbol and command the plan cites is real (check them). Library
   claims match the docs (spot-check with context7).
4. **Phasing:** each phase can be verified on its own and leaves the build green. The phase
   order respects dependencies. Every phase has runnable agent checks, and anything only a
   person can judge (UI, real third-party behaviour) is listed under human checks.
5. **Scope:** no gold-plating, and nothing from *Out of scope* sneaks back in.
6. **Design:** the layering and dependency direction match `tech-stack.md`, and there is no
   needless abstraction. Name a simpler alternative if one exists.
7. **Failure paths:** errors from external systems, validation and persistence each have a
   defined behaviour and a test.
8. **Unknowns:** none is left `BLOCKING`. Every entry in *Decisions* has a reason.
9. **Lessons:** the plan does not contradict any rule in `context/lessons.md`.

## Output: `context/changes/<change-id>/plan-review.md`

```markdown
# Plan review: <change-id>

Verdict: READY | READY WITH NOTES | NEEDS CHANGES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | blocker / major / minor | ... | ... | ... |

## What is good
```

## Rules

- Every finding needs evidence: a quote from the plan, a `file:line`, or a doc link.
- Only blockers justify NEEDS CHANGES. Keep it short, since the author will triage the findings.
