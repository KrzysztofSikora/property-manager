# AI workflow

This project was built AI-first with Claude Code, using a spec-driven workflow of project
skills in `.claude/skills/`. Each step leaves a written artifact in `context/`, so the
reasoning behind the code can be reviewed alongside the code.

```
brief ─▶ /shape ─▶ /prd ─▶ /tech-stack ─▶ /roadmap ─▶ /test-plan
                                              │
                    for every roadmap item (change-id):
                    /plan ─▶ /plan-review ─▶ /implement (phase by phase) ─▶ /mutation ─▶ /review
```

| Skill | Produces | Purpose |
|-------|----------|---------|
| `/shape <brief>` | `context/shape-notes.md` | Socratic interview: decisions, assumptions, non-goals |
| `/prd` | `context/prd.md` | Testable requirements traced back to the brief |
| `/tech-stack` | `context/tech-stack.md` | Stack choice with trade-offs and a devil's-advocate check |
| `/roadmap` | `context/roadmap.md` | Foundations and vertical slices, ordered by risk |
| `/test-plan` | `context/test-plan.md` | Risk register, test levels, quality gates, cookbook |
| `/plan <id>` | `context/changes/<id>/plan.md` | Research, a short decision interview, agreed phases with agent and human checks |
| `/plan-review <id>` | `context/changes/<id>/plan-review.md` | Independent readiness check (forked context) |
| `/implement <id> [n]` | code, one commit per phase | One verified phase per run: tests, human checks, then a commit whose hash is recorded in the plan |
| `/mutation <id>` | `context/changes/<id>/mutation.md` | Stryker on risk-critical modules; every surviving mutant gets a decision, and assertions are strengthened only for real gaps |
| `/review <id>` | `context/changes/<id>/review.md` | Plan-vs-diff map and at most 10 verified findings (forked context); findings can become rules in `context/lessons.md` |

## Principles

- **Artifacts over chat.** Decisions live in files that the next step reads, not in session
  memory.
- **Human gates.** All skills are invoked explicitly (`disable-model-invocation: true`). The
  user approves the stack, the plans and each implemented phase.
- **Independent reviews.** `/plan-review` and `/review` run in a forked context, so the
  reviewer does not share the author's assumptions.
- **A feedback loop.** Review findings that point at a recurring problem become rules in
  `context/lessons.md`. `/plan`, `/plan-review`, `/implement`, `/mutation` and `/review` all
  read them.
- **Traceable history.** Each implemented phase is one Conventional Commit, and its hash is
  written next to the phase in the plan.
- **Tests that defend, not just cover.** Coverage shows code ran. Mutation testing shows the
  assertions would catch a fault. Its score is a pointer. The decision on each surviving mutant
  is the actual output.
- **Verify, don't recall.** Library facts are checked against current docs (context7 MCP), and
  review findings are confirmed in the code before they are reported.
