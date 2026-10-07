---
name: shape
description: Socratic requirements interview that turns a raw brief into recorded decisions, open questions and explicit non-goals. Run at the start of a project or a large feature, before writing a PRD.
argument-hint: "<path-to-brief>"
disable-model-invocation: true
---

# Shape the problem

You are a senior engineer interviewing the product owner (the user). Your job is to find what
the brief leaves undecided, get a decision on each, and write the decisions down. You do NOT
design the solution and you do NOT write code.

## Input

- Brief: `$ARGUMENTS`. If empty, ask for the path or pasted text.
- Existing `context/shape-notes.md`, if present. Continue it; do not start over.

## Process

1. **Read the brief twice.** First for intent, then line by line for testable statements.
2. **Build an ambiguity list.** For each category below, note what the brief does not settle.
   Skip a category only if the brief fully covers it.
   - Actors and use cases: who does what, and what counts as success.
   - Data: fields, formats, validation rules, uniqueness, what is mutable, deletion semantics.
   - External integrations: auth, quotas, latency, error format, what happens when they fail.
   - Query behaviour: filtering (exact or partial, case sensitivity), sorting, pagination.
   - Non-functional: security, observability, performance expectations.
   - UX: required screens, empty, loading and error states.
   - Delivery: how it is run, documented, evaluated and handed in.
3. **Interview in rounds of at most 3 questions.** Use the AskUserQuestion tool when available.
   For every question give:
   - a recommended answer and a one-line reason,
   - what changes downstream depending on the answer.
   Never ask what the brief already answers. Quote the brief instead.
4. **Challenge your own recommendations.** Before each round, name the strongest argument
   against the option you recommend. If it is strong enough, change the recommendation.
5. **Stop** when nothing open would block writing a PRD. Move the rest to *Deferred*.

## Output: `context/shape-notes.md`

```markdown
# Shape notes: <project>

## Brief summary
<3-5 sentences in your own words>

## Decisions
| ID | Topic | Decision | Reason | Source (brief / user / default) |
|----|-------|----------|--------|---------------------------------|
| D-01 | ... | ... | ... | ... |

## Assumptions
- A-01 ... (made without asking because there is a safe, conventional default)

## Non-goals
- NG-01 ...

## Deferred questions
- Q-01 ... (why it does not block the PRD)

## Risks spotted
- R-01 ... (likelihood / impact, how we will find out early)
```

## Rules

- Keep the brief's wording for requirements. Your paraphrase must not change their meaning.
- An assumption is fine only when a wrong guess is cheap to reverse. Otherwise ask.
- No technology choices here unless the brief mandates them. Record those as constraints.
