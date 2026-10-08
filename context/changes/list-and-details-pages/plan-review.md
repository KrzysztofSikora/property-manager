# Plan review: list-and-details-pages

Verdict: READY WITH NOTES

| # | Severity | Check | Finding | Suggested change |
|---|----------|-------|---------|------------------|
| 1 | major | Design / Failure paths | The fix for the details-page "not-found flash" cannot work in the order the plan gives. The plan says `useDeleteProperty` "On success and on `PROPERTY_NOT_FOUND` ... calls `invalidateQueries({ queryKey: ['properties'] })`. The caller handles navigation", and that on the details page "Before navigating, the detail query is removed". TanStack runs the `useMutation` callbacks before the `mutate()` callbacks, and it awaits the hook's `onSuccess` before the mutation settles ([mutations guide](https://github.com/tanstack/query/blob/main/docs/framework/solid/guides/mutations.md), `query-core/src/mutation.ts`). So the prefix invalidation refetches the active `['properties','detail',id]` query, which gets `null`, before `onDeleted` can remove the query or navigate. The user sees "Property not found", and the deleted id gets an extra `Property` request. The AC4 test ("the list page heading appears") still passes, so nothing would catch it. | Keep the deleted id's detail query out of the refetch. For example, the hook invalidates with a `predicate` (or `refetchType: 'none'`) for `['properties','detail',id]` and refetches only the list. Add a phase 3 assertion: after a confirmed delete (and after `PROPERTY_NOT_FOUND`), MSW records no second `Property` request and "Property not found" never appears. |
| 2 | minor | Failure paths | The production client is `new QueryClient()` (`apps/web/src/main.tsx:13`), so it keeps the default 3 retries with backoff. Tests use `retry: false` (`apps/web/src/test/render.tsx:7`). In the real app, the FR-11 AC6 / NFR-09 error state shows only after about 7 s. `ApiStatus.tsx:12-13` turned retries off for exactly this reason, and S-04 deletes that file. | Decide the retry policy (for example `retry: false` or `retry: 1` on the two queries or on the client) and record it in *Decisions*. Or accept the delay and add it to the phase 1 human check. |
| 3 | minor | Failure paths | The filter values can trigger a validation error: "each value may be at most 100 characters" (`apps/api/schema.graphql:53-54`, `BAD_USER_INPUT`). The plan does not say what happens. Today the generic "Could not load properties" would show, with a Retry button that can never succeed. | Add `maxLength` (100 for City, 5 for Zip) to the inputs so the form cannot send an invalid value. One line in the plan is enough. Don't add a separate error path. |
| 4 | minor | Traceability | TR-20 says "a snapshot without `astro` / `air_quality` renders" (`context/test-plan.md:47`). The plan reasonably proves FR-12 AC5 with empty `weatherDescriptions` / `weatherIcons` instead, but in phase 3 it changes only the TR-20 status. The `/review` AC-to-test check would then find a test approach the tests do not follow. | In phase 3, also rewrite the TR-20 approach text to say empty description/icon lists, and note that `astro` / `air_quality` live only in `raw` (#11). |
| 5 | minor | Design | The *Delete failure* decision says that for `PROPERTY_NOT_FOUND` "The dialog stays open and shows a message". On the details page the user is sent to `/` right away, so the dialog unmounts and nobody sees the message. | Say explicitly that the details page skips the message and navigates, so the implementer does not write a test expecting the message on that page. |

## What is good

- Every Must AC in scope (FR-11 AC1/2/3/5/6/7, FR-12 AC1–AC5, NFR-09) maps to a named test in
  a named phase. Out-of-scope items (#9, #10, #11, S-05 message table, E2E, API changes) are
  listed and stay out.
- Grounding checks out. `routes.tsx:10-16`, `routes.test.tsx:9-16,18-22`, `ApiStatus.tsx:5`,
  `Layout.tsx:2,14`, `msw.ts:6-9` and `setup.ts:7` (`onUnhandledFrame: 'error'`) all match the
  repo. Web `package.json` has neither shared nor user-event. jsdom 30.1.2's
  `HTMLDialogElement-impl.js` is an empty class. user-event is 14.6.7. `ERROR_CODES` /
  `US_STATES` are exported from shared. The SDL nullability claims match `schema.graphql`.
- The design is minimal and follows `tech-stack.md`: pages → hooks → `execute()`, with
  hierarchical query keys so one prefix invalidation covers both views. There is no extra
  abstraction. `errorCode` takes only what S-04 needs and does not anticipate S-05.
- Choices made with testing in mind are explained: dialog "mounted = open", street `<Link>`
  instead of `<tr onClick>`, filters applied on submit (no fake timers), TZ pinned with a
  fallback.
- Delete-failure tests assert the message and the recorded requests, which follows the lesson
  "Assert an error's cause or code".
- Each phase has runnable agent checks plus human checks for what jsdom cannot show (modality,
  Esc, focus, icon loading).
