# Mutation check: create-property-page

Targets: `apps/web/src/lib/graphql-errors.ts` (whole file), `apps/web/src/hooks/useCreateProperty.ts`
(whole file), `apps/web/src/pages/CreatePage.tsx:33-67` (the `submit` handler; JSX skipped as
presentation) · Tests: `apps/web/vitest.config.ts` (command runner, `--concurrency 4`)
Score: 94.4% -> 97.2% (before 98 / 6 / 0 / 3; after 99 / 3 / 0 / 5 killed / survived / no
coverage / timeout)

Per file after: `graphql-errors.ts` 95.5% (3 equivalent survivors), `useCreateProperty.ts` 100%,
`CreatePage.tsx` 100%.

The test plan has no `/mutation` step for S-05 (`test-plan.md`, *Not tested*); this run was
requested explicitly. The 5 timeouts are emptied blocks (`submit`, `mutationFn`, `fieldErrors`,
the `onError` object) and the emptied `'zipCode'` form-field name, where a test awaits a
`findBy` that never resolves. They are real failures, not load artefacts (lesson: re-run at
lower concurrency).

## Mutants
| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `graphql-errors.ts:39` | OptionalChaining | `errors[0]?.message` → `errors[0].message` | equivalent | Reached only when `errorCode()` returned `WEATHER_LOCATION_MISMATCH`, which it read from `errors[0].extensions.code`, so `errors[0]` exists. |
| `graphql-errors.ts:59` | OptionalChaining | `extensions?.fields` → `extensions.fields` | equivalent | Reached only when `errorCode()` is `BAD_USER_INPUT`, read from `errors[0].extensions.code`, so `extensions` exists. |
| `graphql-errors.ts:59` | OptionalChaining | `errors[0]?.extensions` → `errors[0].extensions` | equivalent | Same guard: `errors[0]` exists once the code is `BAD_USER_INPUT`. |
| `CreatePage.tsx:34` | CallExpression | `event.preventDefault()` removed | strengthen | In a browser the native submit reloads the page, dropping the request and the entered values (FR-13 AC2, AC3). New test "cancels the native form submission…": `fireEvent.submit(form)` returns `false`. |
| `CreatePage.tsx:37` | CallExpression | `setFormMessage(null)` removed | strengthen | A stale "already exists" alert stays next to new field errors. "replaces the field and form messages on the next submit" now does a third submit (empty street) and asserts no alert. |
| `CreatePage.tsx:51` | OptionalChaining | `issues.zipCode?.[0]` → `issues.zipCode[0]` | strengthen | With a valid zip and another invalid field, the handler throws and no message shows (FR-13 AC1). Every AC1 test had an invalid zip. The same third submit (only the street invalid) asserts the street message and one request in total. |

## Dead-weight tests

The command runner reports kills per run, not per test, so this is from reading, not from the
report:

- `graphql-errors.test.ts`: "gives nothing when only unknown fields are named" exercises the
  same `isAddressField` check as "keeps the known field and drops an unknown one"; any mutant
  of that check that the first kills, the second kills too. Candidate to fold into one
  `it.each` of `fields` lists → expected result (with the "fields is …" table next to it).
  Not changed here.

## Gaps for the test plan

- `CreatePage.tsx`'s `submit` handler and `useCreateProperty.ts` are not in *Mutation targets*.
  Baselines from this run: 100% each. Suggest adding them next to `useDeleteProperty.ts`
  (validation gate before the request, error dispatch to field vs form, the list cache key).
- AC1 tests only combined invalid fields with an invalid zip; a single-field failure was
  untested until this run. Worth stating in TR-21: "at least one case where only one field is
  invalid".
