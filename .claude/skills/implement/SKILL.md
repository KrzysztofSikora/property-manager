---
name: implement
description: Implement exactly one phase of an approved change plan, verify it, wait for the human checks, commit the phase with the user's approval and record progress. Stops at the phase boundary.
argument-hint: "<change-id> [phase-number]"
disable-model-invocation: true
---

# Implement one phase

## Input

- `$ARGUMENTS`: the change-id and optionally a phase number. With no phase given, take the
  first unticked phase in *Progress*.
- `context/changes/<change-id>/plan.md`, and `plan-review.md` if present. If the review verdict
  is NEEDS CHANGES and the plan has not changed since the review, stop and say so.
- `CLAUDE.md` and `context/lessons.md` (if present). Lessons are binding rules.

## Process

1. **Start.** Restate the phase goal and its checks in two lines. Set the roadmap status to
   `in-progress`. Run `git status`, and note any files that were already modified so you never
   commit them by accident.
2. **Test first where it pays.** For domain logic, validation and adapters, write the failing
   test from the AC, run it, and watch it fail for the right reason.
3. **Build** the smallest change that makes the tests pass and matches the plan's design.
   Keep a running list of every file you create or edit.
4. **Run the agent checks**, then the project-wide typecheck and lint. Fix every failure. Never
   weaken or skip a test to get green.
5. **Handle drift.** If reality differs from the plan, describe it in three lines (plan says,
   code shows, consequence).
   - When the change is small and local, do it and log it under *Deviations*.
   - When it changes the scope, design or a later phase, ask the user whether to adapt, drop
     that part, or stop and re-plan.
6. **Wait for the human checks.** If the phase lists any, show them as a short checklist with
   how to run each one (URL, command, sample input). Wait for the user to confirm. Do not tick
   human checks yourself.
7. **Commit the phase** once the user has confirmed:
   - Stage, by explicit path, only the files on your list from step 3 plus `plan.md`. Bulk
     staging is off-limits. If other files are dirty, name them and leave them alone.
   - Propose a Conventional Commit message, `<type>(<change-id>): <what the phase delivers>`,
     and commit after the user approves or edits it. Never use `--no-verify`. If a hook fails,
     fix the cause and commit again.
   - Tick the phase in *Progress* and append the short hash:
     `- [x] Phase 1: <name> (a1b2c3d)`. The hash edit itself lands in the next phase's commit,
     or in a final `docs(<change-id>): close plan` commit after the last phase.
   - If the user says not to commit, tick the phase without a hash and say so.

## Report to the user

- What changed, file by file, one line each.
- Each check and its result.
- Deviations, if any.
- What comes next: the next phase (suggest `/clear` first if the context is long), or, when
  all phases are done, `/review <change-id>`.

## Rules

- One phase per run. Do not start the next phase unless the user explicitly asks for several.
- No drive-by refactors outside the phase's files. Note them under *Deviations* as follow-ups.
- No secrets in code, tests, logs or commits. Use `.env` and keep `.env.example` up to date.
