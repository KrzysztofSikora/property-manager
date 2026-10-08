# Review: create-property-page

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 573 passed / 0 failed (`pnpm test`, 39 files, Testcontainers
included); also `pnpm format:check` ok and `pnpm codegen` leaves no drift.

Base: `9834218` (parent of `afe3150`, the first `(create-property-page)` commit). No uncommitted
changes at review time.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/web/src/lib/graphql-errors.ts` | done | `CREATE_ERROR_MESSAGES: Record<ErrorCode, string>`, `createErrorMessage`, `fieldErrors` (zod-parsed `extensions.fields`), `AddressField`; `errorCode` unchanged. Wording matches the plan. |
| `apps/web/src/lib/graphql-errors.test.ts` | done | TR-19 `it.each(ERROR_CODES)`, mismatch with/without server text, unknown code / HTTP / network / plain `Error`, every `fieldErrors` case the plan lists. Asserts values, not presence. |
| `apps/web/src/hooks/useCreateProperty.ts` | done | Throws on `createProperty: null`; returns the list invalidation from `onSuccess`. Generics are inferred instead of `useMutation<string, Error, Address>`; same types. |
| `apps/web/src/hooks/useCreateProperty.test.tsx` | done | Variables, id, list stale / details untouched, `null` → error and no invalidation. |
| `apps/web/src/graphql/{gql,graphql}.ts` | done | Codegen output; re-running `pnpm codegen` produces no diff. |
| `apps/web/src/pages/CreatePage.tsx` | done | `onSubmit` + `preventDefault`, `FormData`, shared schema, `z.flattenError`, no `maxLength`, `aria-invalid` / `aria-describedby`, form-level `role="alert"`, "Creating…" while pending. |
| `apps/web/src/pages/CreatePage.test.tsx` | done | AC1 (incl. 6-digit zip, lowercase state), AC2 (delayed handler, normalized variables, redirect), AC3 `it.each` over the four codes with values kept, AC4, malformed `fields`, network error. Recorder handler proves "no request". |
| `apps/web/src/app/routes.test.tsx` | done | Planned "unchanged"; unchanged and passing. |
| `context/test-plan.md` | done | TR-19 / TR-21 → `covered (S-05)`; format deviation logged under *Deviations*. |
| `context/changes/create-property-page/mutation.md` | unplanned | The plan put `/mutation` out of scope; the file says the run was requested explicitly. Decisions are recorded for every survivor. |
| `context/changes/create-property-page/plan-review.md` | unplanned | Process artifact. |
| `context/lessons.md` | unplanned | New lesson from the mutation check. |
| `context/roadmap.md` | unplanned | S-05 status (set to `review` by this review). |
| `ai-sessions/56-60-*.txt` | unplanned | Session exports. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | FR-13 AC1–AC4 and NFR-09 met; `null` result cannot navigate to `/properties/null`; disabled submit also blocks implicit (Enter) submission. |
| Design | ok | Hook owns cache, page owns navigation (same split as delete); web has no layering beyond that; `extensions.fields` zod-parsed at the boundary. |
| Safety | ok | No secrets; server messages rendered as text by React; malformed error payloads fall back to a message instead of throwing. |
| Tests | ok | Behavioural, deterministic (`delay`, recorder), failure paths covered; mutation `equivalent` decisions are sound (each `?.` sits behind `errorCode()`, which already read `errors[0].extensions.code`). |
| Simplicity | concern | One fallback message refers to UI that is not shown (R1). |
| Plan fidelity | ok | Every planned file done; the one deviation is logged. |

## Findings
### R1: Fallback `BAD_USER_INPUT` message says "Check the highlighted fields" when none is highlighted
- Severity: minor
- Where: `apps/web/src/lib/graphql-errors.ts:20`, `apps/web/src/pages/CreatePage.tsx:61-65`
- Problem: the form-level `BAD_USER_INPUT` message is shown only when `fieldErrors(error)` is
  empty (`CreatePage.tsx:63-64`). In that branch `fieldMessages` was just reset to `{}`
  (`CreatePage.tsx:36`), so no input has `aria-invalid` and no field message exists. The user
  is told to check highlighted fields that are not there. The test
  "BAD_USER_INPUT without usable fields shows the table message at form level"
  (`CreatePage.test.tsx:234-240`) asserts exactly this text. The plan chose both the wording
  and the fallback, but did not reconcile them.
- Fix: reword the entry so it stands alone, e.g. "Some fields are invalid. Check the values
  and try again.", and update the regex in the test that matches `/check the highlighted
  fields/i`.
- Effort: small
- Decision: fix. Reworded to "Some fields are invalid. Check the values and try again."; the
  test asserts the full text and the plan table is updated.

### R2: Client-side field errors are not announced and focus stays on the button
- Severity: minor
- Where: `apps/web/src/pages/CreatePage.tsx:46-53`, `:89-91`
- Problem: when validation fails, the page sets field messages and returns. The messages are
  plain `<p>` elements linked by `aria-describedby`, with no live region, and nothing moves
  focus (no `focus()` call anywhere in `apps/web/src/pages/`). A screen-reader user who
  submits with the keyboard hears nothing; the errors are read only after tabbing back into
  each input. Server-side errors without fields use `role="alert"`, so the two error paths
  behave differently. FR-13 does not name accessibility, so this is not an AC failure; the
  plan's human check "keyboard-only fill and submit" is where it would show.
- Fix: after a failed client or server field validation, focus the first invalid input (it
  already carries `aria-describedby`, so its message is read). Add one test:
  `expect(inputs.street()).toHaveFocus()` after the AC1 submit.
- Effort: small
- Decision: fix. An effect focuses the first invalid input (in form order) whenever field
  messages are set, for client and server validation; AC1 and AC4 tests assert `toHaveFocus()`.
