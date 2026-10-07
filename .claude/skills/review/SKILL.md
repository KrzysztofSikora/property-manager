---
name: review
description: Independent code review of a finished change against its plan and the PRD. Maps planned files to the actual diff, checks quality and safety, reports at most 10 verified findings, and saves context/changes/<change-id>/review.md. Runs in a fresh context.
argument-hint: "<change-id> [base-ref]"
disable-model-invocation: true
context: fork
---

# Review a change

You are reviewing someone else's diff. Report only problems you have confirmed in the code.
Do not modify code. The author decides what to fix.

## Input

- `$ARGUMENTS`: the change-id and optionally a base ref. The default is the parent of the
  first commit whose subject contains `(<change-id>)`, or `main` if there is none.
- The diff: `git diff <base>...HEAD` plus uncommitted changes.
- `context/changes/<change-id>/plan.md`, `context/prd.md`, `CLAUDE.md`, `context/lessons.md`,
  and `context/changes/<change-id>/mutation.md` if present.

## Process

1. **Compare the plan with the diff.** Build a table of every file named in the plan and every
   file in the diff, with one status each:
   - `done`: in both, and the change matches the stated intent;
   - `diverged`: in both, but it does something different from the plan (and is not logged
     under *Deviations*);
   - `absent`: planned but not changed;
   - `unplanned`: changed but not in the plan.
   Confirm `diverged` by reading the code, not just the file name.
2. **Read for quality.** For every changed function, open the surrounding code and look at:
   - **Correctness:** ACs met, edge cases, error paths, data integrity.
   - **Design:** layering, dependency direction, cohesion, justified patterns, no premature
     abstraction, consistency with neighbouring modules.
   - **Safety:** input validation at the boundary, no secrets, no injection, external failures
     mapped to clear errors, nothing swallowed.
   - **Tests:** they assert behaviour (not mocks), cover failure paths and are deterministic.
     If `mutation.md` exists, check that every `accept` or `equivalent` decision is plausible.
     A survivor on a mutation target from the test plan with no decision is at least `major`.
   - **Simplicity:** naming, function size, duplication, dead code.
   - **Lessons:** any breach of `context/lessons.md` is at least `major`.
   For a diff larger than about 15 files, you may split the reading between two Explore
   subagents (backend and frontend) and merge their notes yourself.
3. **Verify every candidate.** Re-read the path, or run a test or quick script. Drop anything
   you cannot demonstrate.
4. **Run the gates:** full test suite, typecheck and lint. Record the results.
5. **Rank and trim.** Order findings by severity. Merge related ones. Keep at most 10.

## Output: `context/changes/<change-id>/review.md`

```markdown
# Review: <change-id>

Verdict: APPROVE | APPROVE WITH FOLLOW-UPS | CHANGES REQUESTED
Gates: typecheck <ok/fail>, lint <ok/fail>, tests <n passed / n failed>

## Plan vs diff
| File | Status | Note |

## Areas
| Area | Result (ok / concern / fail) | One-line reason |
<!-- Correctness, Design, Safety, Tests, Simplicity, Plan fidelity -->

## Findings
### R1: <short title>
- Severity: blocker | major | minor
- Where: `file:line`
- Problem: <what is wrong, with evidence>
- Fix: <the change you suggest; add a second option only if there is a real trade-off>
- Effort: small | medium | large
- Decision: open
```

Severity: **blocker** means wrong behaviour, a security issue or failing gates; **major** is a
real maintainability or correctness risk; **minor** is worth fixing but safe to defer.
Style-only remarks are not findings.

The verdict is CHANGES REQUESTED if any blocker exists, APPROVE WITH FOLLOW-UPS if there are
majors, and APPROVE otherwise. Set the roadmap status to `review`.

## After the report

Return a short summary to the main session: the verdict, the gates, and a one-line list of the
findings. Tell the user to go through the findings in the main session. For each `R` item they
choose **fix**, **defer** (move it to the plan's *Deviations* as a follow-up), **reject** (add
a one-line reason), or **make it a rule**: append it to `context/lessons.md` in the lesson
format below, then ask whether to also fix it now. Update each finding's `Decision:` line.

Lesson format (create the file with a `# Lessons` heading if it does not exist):

```markdown
## <rule, as an imperative sentence>
- Why: <the failure it prevents>
- Seen in: <change-id>, R<n>
- Scope: <paths or layers it applies to>
```
