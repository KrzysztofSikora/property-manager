---
name: test-plan
description: Risk-based test strategy - rank what can go wrong, choose the cheapest test level that catches it, define quality gates and a how-to cookbook. Produces context/test-plan.md.
disable-model-invocation: true
---

# Write the test plan

Tests exist to catch the failures that matter. Coverage is not the goal. Start from risks,
not from files.

## Input

- `context/prd.md`, `context/tech-stack.md`, `context/roadmap.md`, and the current code.

## Process

1. **List risks.** For each Must FR and each integration point, ask what could break, how
   badly, and how likely that is. Include security risks (input validation, secret leakage)
   and third-party failure modes (timeouts, error payloads, quota exhaustion, changes in
   response shape).
2. **Rank them** by impact × likelihood (high, medium or low on each).
3. **Assign the cheapest effective test level** to each risk:
   - **unit:** pure logic, validation, mapping;
   - **integration:** an API request through to the DB, with third parties replaced at the
     network boundary;
   - **e2e:** a small number of critical user journeys through the real UI.
   Say explicitly what you will not test, and why.
4. **Define quality gates:** what runs in the editor hook, pre-commit and CI, and what must be
   green to merge.
5. **Pick mutation targets.** Name the few modules where a test that runs the code but does not
   guard it would be costly: validation, mapping of third-party responses, error mapping,
   query building. For each, give the reason and a starting score to aim for. `/mutation`
   checks these after each change and records the baseline. Say whether the CI job reports
   only or fails the build, and at what score.
6. **Write a cookbook** with step-by-step recipes for adding each kind of test in this repo,
   with file locations and helpers. Agents will follow these recipes later.

## Output: `context/test-plan.md`

```markdown
# Test plan

## Risk register
| ID | Risk | Impact | Likelihood | Level | Test(s) | Status |
|----|------|--------|------------|-------|---------|--------|

## Not tested (and why)
## Quality gates
| Gate | Runs | Must pass |
## Mutation targets
| Module | Why | Target score | CI (report / break at N%) |
## Test data and isolation
## Cookbook
### Add a unit test
### Add an integration test
### Add an e2e test
### Run a mutation check
```

## Rules

- No test without an assertion on observable behaviour.
- Never call real third-party APIs in automated tests.
- Revisit this file when a slice adds a new integration or a bug escapes.
