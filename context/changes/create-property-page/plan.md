# Plan: create-property-page (S-05)

## Goal and end state

The `/properties/new` route creates a property and lands on its details page. When done:

- An empty field, a zip that is not 5 digits or a state that is not a valid code shows a
  field-level message, and no request is sent (FR-13 AC1).
- Valid input sends one `CreateProperty` mutation; while it is pending the submit button is
  disabled; on success the user is on `/properties/<new id>` (FR-13 AC2).
- `PROPERTY_ALREADY_EXISTS`, `WEATHER_QUOTA_EXCEEDED`, `WEATHER_LOCATION_MISMATCH` and
  `WEATHER_UNAVAILABLE` each show the cause FR-10 lists for that code, and the entered values
  stay in the inputs (FR-13 AC3).
- `BAD_USER_INPUT` shows its `extensions.fields` messages next to the named inputs (FR-13 AC4).
- Every code in `ERROR_CODES` has a dedicated UI message (NFR-09, TR-19).

## Scope

- In: the create form on `CreatePage`, a `useCreateProperty` hook, the per-code message table
  and the `extensions.fields` reader in `lib/graphql-errors.ts`, the list-cache invalidation
  after a create, tests for FR-13 AC1–AC4 (TR-19, TR-21), and the test-plan status of TR-19 /
  TR-21.
- Out: API changes (the contract from S-01/S-02 is used as it is); a `/mutation` step (the test
  plan excludes it for S-05, see *Findings*); live validation while typing; a link to the
  existing property on `PROPERTY_ALREADY_EXISTS` (the error carries no id); e2e (S-06).

## Findings

- `apps/web/src/pages/CreatePage.tsx:1-3` is a placeholder `<h1>New property</h1>`. The route
  (`app/routes.tsx`) and the nav link (`app/Layout.tsx`) exist; `app/routes.test.tsx:9` expects
  the heading "New property", so the page keeps that `<h1>`.
- API contract (`apps/api/schema.graphql:95`): `createProperty(street: String!, city: String!,
  state: String!, zipCode: String!): Property` (nullable). Documented errors: `BAD_USER_INPUT`,
  `PROPERTY_ALREADY_EXISTS`, `WEATHER_UNAVAILABLE`, `WEATHER_QUOTA_EXCEEDED`,
  `WEATHER_LOCATION_MISMATCH`, `INTERNAL_SERVER_ERROR`.
- `BAD_USER_INPUT` shape (`apps/api/src/graphql/errors.ts:13-25`):
  `extensions: { code: 'BAD_USER_INPUT', fields: [{ field, message }] }`, `field` is the zod
  path joined with `.` (here `street`, `city`, `state`, `zipCode`), one entry per field.
- Domain messages (`apps/api/src/domain/errors.ts`) are written to be shown as they are. Only
  `WEATHER_LOCATION_MISMATCH`'s message holds the returned region
  (`Weatherstack placed this address in "<region>", not in AZ (Arizona). …`); the error has no
  extensions besides `code`.
- Shared schema (`packages/shared/src/address.ts`): `addressSchema` trims/collapses street and
  city, upper-cases state and checks it with `isStateCode`, requires `^[0-9]{5}$` for zip. Its
  messages ("must not be empty", "must be 5 digits", …) never echo input. FR-07's rules are
  already proven in `address.test.ts`; the form test only proves the form uses the schema
  (TR-21).
- `lib/execute.ts` throws `GraphQLRequestError(status, errors)` for any `errors` entry or HTTP
  failure; `lib/graphql-errors.ts:errorCode` reads the first error's code, checked against
  `ERROR_CODES`. `GraphQLErrorEntry.extensions` is `Record<string, unknown>`, so `fields` needs
  zod parsing (CLAUDE.md: validate external responses).
- Test support: `renderWithProviders` (`test/render.tsx:10-12`) wraps `ui` in a `MemoryRouter`
  with no `<Routes>`, and does not expose its `QueryClient` (hook tests build their own, as
  `useDeleteProperty.test.tsx:15` does). `test/msw.ts` has no `CreateProperty` handler. With
  `onUnhandledFrame: 'error'` MSW prints an error and rejects the request; it does not fail
  the test (mswjs/msw docs, `UnhandledFrameHandle`, via context7), so it cannot prove "no
  request is sent".
- **Browsers truncate to `maxLength` silently.** Typed or pasted text longer than `maxLength`
  is cut without a message, so a pasted `852681` would become `85268` and pass `^[0-9]{5}$`.
- `context/test-plan.md:79-81`: S-05 has no `/mutation` step; `graphql-errors.ts` (a mutation
  target, baseline 100% in S-04) is guarded by TR-19's unit table, which must fail when a code
  is added without a message.
- **React 19 form actions reset the form.** With `<form action={fn}>`, "after the action
  succeeds, all uncontrolled field elements in the form are reset"
  (react.dev/reference/react-dom/components/form, via context7). FR-13 AC3 requires the values
  to stay, so the form uses `onSubmit` + `preventDefault()` like `ListPage`, not `action`.
- **zod 4 `z.flattenError(error)`** returns `{ formErrors: string[], fieldErrors: { [key]:
  string[] } }` (zod v4.6.5 docs, error-formatting, via context7). Fits a flat schema.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| State control | Text input labelled "State", validated by the shared schema; lowercase is accepted and upper-cased. | Matches FR-13 AC1 ("a state that is not a valid code") and TR-21 (`"XX"`) as written, and the API's own rule. | user |
| Source of the per-code messages | A client table in `lib/graphql-errors.ts` with one message per `ErrorCode`. For `WEATHER_LOCATION_MISMATCH` the UI shows the API message, which is the only place that names the returned region; the table entry is the fallback when that message is missing. | NFR-09 / TR-19 want a dedicated UI message per code; FR-10 wants both states for the mismatch, and only the server has them. | user |
| Input length limits | No `maxLength` on any input; the shared schema reports "must be 5 digits", "must be at most 200 characters", etc. | Browser truncation is silent and would save a wrong zip (FR-13 AC1). | research (plan-review #1) |
| When client validation runs | On submit only. Field messages are replaced on the next submit. | Simplest; one parse of the shared schema. | user |
| Phase split | (1) messages, field-error reader and hook; (2) the page. | Agreed with the user. | user |
| Form state | Uncontrolled inputs read with `FormData` in `onSubmit` + `preventDefault()`; never `<form action>`. | The values stay in the DOM on error (AC3); React's action prop would reset them. Same pattern as `ListPage`. | research |
| What is sent | The zod output (trimmed, collapsed, state upper-cased), not the raw input. | It is the value that was validated; the server normalizes the same way, so the result is identical. | research |
| Field errors from the server | `fieldErrors(error): Partial<Record<AddressField, string>>` parses `extensions.fields` with zod; entries for unknown fields are ignored; a malformed `fields` gives `{}`, and the form then shows the `BAD_USER_INPUT` table message at form level. | CLAUDE.md: external responses are zod-parsed. A drifted response still shows something. | research |
| Which message shows when the form gets field errors | Field messages only; no form-level message for `BAD_USER_INPUT` when at least one field matched. An unknown field next to a known one is dropped without a message (accepted). | AC4 asks for messages next to the fields; a duplicate summary adds noise. The API names only the four arg fields (`errors.ts:13-25`), so the mixed case needs API drift. | research (plan-review #6) |
| Name and scope of the message table | `CREATE_ERROR_MESSAGES` / `createErrorMessage`: the wording is for the create form. `PROPERTY_NOT_FOUND` has an entry only to keep `Record<ErrorCode, string>` complete; nothing shows it. | The texts say "the property was not saved"; a generic name would invite reuse where they read wrong. | research (plan-review #4) |
| Unknown / network / `INTERNAL_SERVER_ERROR` / `createProperty: null` | Form-level message from the table's `INTERNAL_SERVER_ERROR` entry ("Something went wrong, the property was not saved. Try again."). A `null` result is thrown by the hook as an error. | NFR-09: every outcome has a message; a `null` without errors breaks the contract and must not navigate to `/properties/null`. | research |
| Cache after success | `invalidateQueries({ queryKey: ['properties', 'list'] })` in the hook's `onSuccess`; the details page fetches the new property itself. No `setQueryData` seeding. | Mirrors `useDeleteProperty`; seeding would need the mutation to select the details page's exact fields. | research |
| Navigation after success | `navigate('/properties/<id>')` in the page's `mutate` `onSuccess`. The hook does not navigate. | Same split as delete: the hook owns the cache, the caller owns navigation. | research |
| How AC3 messages are asserted | The code's key facts as case-insensitive regexes (test plan: "Exact wording of messages"): `/already exists/i`; `/upgrade the plan or replace the api key/i`; for mismatch the API text with both states; `/try again later/i` for unavailable. | Tests do not pin full sentences or case. | research (test plan, plan-review #5) |

## Design

### Data flow

```
CreatePage (onSubmit) → addressSchema.safeParse → useCreateProperty().mutate(address)
  → execute(CreatePropertyMutation, vars) → POST /graphql
success → invalidate ['properties','list'] → navigate(/properties/:id)
error   → errorCode / fieldErrors / createErrorMessage → messages, inputs untouched
```

### `lib/graphql-errors.ts` (additions)

- `CREATE_ERROR_MESSAGES: Record<ErrorCode, string>`: one create-form message per code.
  `Record<ErrorCode, …>` makes a missing code a type error; the TR-19 test also iterates
  `ERROR_CODES`, so a code without a non-empty message fails a test.
  - `BAD_USER_INPUT`: "Some fields are invalid. Check the values and try again."
    (reworded after review R1: it is shown only when no field is highlighted)
  - `PROPERTY_ALREADY_EXISTS`: "A property with this address already exists."
  - `PROPERTY_NOT_FOUND`: "This property no longer exists." (completeness only; the create
    mutation does not return it)
  - `WEATHER_QUOTA_EXCEEDED`: "The Weatherstack usage limit has been reached, so the property
    was not saved. Upgrade the plan or replace the API key."
  - `WEATHER_UNAVAILABLE`: "Weather could not be fetched, so the property was not saved. Try
    again later."
  - `WEATHER_LOCATION_MISMATCH`: "Weatherstack placed this address in a different state, so
    the property was not saved." (fallback only)
  - `INTERNAL_SERVER_ERROR`: "Something went wrong, the property was not saved. Try again."
- `createErrorMessage(error: unknown): string`: `WEATHER_LOCATION_MISMATCH` with a non-empty
  first error message → that message; a known code → `CREATE_ERROR_MESSAGES[code]`; anything
  else (network, HTTP, unknown code, plain `Error`) →
  `CREATE_ERROR_MESSAGES.INTERNAL_SERVER_ERROR`.
- `fieldErrors(error: unknown): Partial<Record<AddressField, string>>` where `AddressField` is
  `keyof AddressInput`: only for `BAD_USER_INPUT`; zod-parses `extensions.fields` as
  `{ field: string; message: string }[]`; keeps entries whose `field` is an address field.
- The S-04 `DeletePropertyDialog` keeps its own strings; switching it to the table is out of
  scope (no behaviour change wanted in this slice).

### `hooks/useCreateProperty.ts`

- Document `CreateProperty($street, $city, $state, $zipCode) { createProperty(...) { id } }`
  (codegen output committed).
- `useCreateProperty()`: `useMutation<string, Error, Address>`; `mutationFn` returns the new
  id and throws when `createProperty` is `null`; `onSuccess` returns the list invalidation (so
  `isPending` lasts until it settles, as in `useDeleteProperty`).

### `pages/CreatePage.tsx`

- `<h1>New property</h1>`, a `<form noValidate onSubmit>` with four labelled text inputs:
  Street, City, State, Zip code (`inputMode="numeric"`), none with `maxLength`, and a
  "Create property" submit button.
- Each input has `aria-invalid` and `aria-describedby` pointing at its message element when it
  has an error, so Testing Library finds the message with `toHaveAccessibleDescription`.
- On submit: clear messages; `addressSchema.safeParse`; on failure set field messages from
  `z.flattenError(...).fieldErrors` (first message per field) and stop; on success
  `mutate(address, { onSuccess: (id) => navigate(...), onError: … })`.
- On error: `fieldErrors(error)` non-empty → field messages; else a form-level
  `role="alert"` with `createErrorMessage(error)`.
- While pending: submit disabled and labelled "Creating…" (`role="status"` not needed; the
  button state is the pending indicator AC2 names).
- No `maxLength`: over-long or 6-digit input reaches the schema and gets its message, instead
  of being cut by the browser.

### Test support

- `test/msw.ts`: no default `CreateProperty` handler. Tests that expect a request add one with
  `server.use(...)`. Tests that expect none install a recorder handler and assert it saw zero
  calls; that assertion is the guard (`onUnhandledFrame` never fires once it is installed).
- Page tests pass `<Routes>` with `CreatePage` at `/properties/new` and a stub details route
  as `ui` to `renderWithProviders`, so the redirect is observable (`/properties/:id` → a
  heading with the id).
- The hook test builds its own `QueryClient` (as `useDeleteProperty.test.tsx`) to seed and
  inspect the cache.

## Phases

### Phase 1: Create error messages and hook

- Files:
  - `apps/web/src/lib/graphql-errors.ts`: add `CREATE_ERROR_MESSAGES`, `createErrorMessage`,
    `fieldErrors` and the `AddressField` type. Contract:
    `createErrorMessage(error: unknown): string`,
    `fieldErrors(error: unknown): Partial<Record<AddressField, string>>`; `errorCode` unchanged.
  - `apps/web/src/lib/graphql-errors.test.ts`: TR-19 mapper table: `it.each(ERROR_CODES)` →
    non-empty message per code; `createErrorMessage` for mismatch with and without a server
    message, for an unknown code, a network failure and a plain `Error`; `fieldErrors` for a
    valid list, an unknown field, a known plus an unknown field (only the known one kept),
    duplicate entries (first wins), a malformed `fields`, a non-`BAD_USER_INPUT` code.
    Assert the returned values, not only presence (lesson: assert the code/cause).
  - `apps/web/src/hooks/useCreateProperty.ts`: new hook. Contract: `mutate(address: Address)`
    resolves to the new id; `null` result rejects.
  - `apps/web/src/hooks/useCreateProperty.test.tsx` (own `QueryClient`): sends the address as
    variables, resolves to the id, invalidates a cached list query (marked stale /
    refetched), leaves a cached details entry alone; `createProperty: null` → error.
  - `apps/web/src/graphql/{gql,graphql}.ts`: codegen output for `CreateProperty`.
- Proves: TR-19 mapper part (NFR-09), groundwork for FR-13 AC2–AC4; unit level (Vitest, MSW).
- Agent checks: `pnpm codegen` (no drift after commit), `pnpm typecheck`, `pnpm lint`,
  `pnpm vitest run --project web`, `pnpm test:unit`.
- Human checks: the message wording in `CREATE_ERROR_MESSAGES` reads well and matches FR-10's
  "Message must say" column.

### Phase 2: Create property page

- Files:
  - `apps/web/src/pages/CreatePage.tsx`: the form described in *Design*. Contract: route
    `/properties/new`; heading "New property"; labels Street, City, State, Zip code; button
    "Create property"; on success navigates to `/properties/:id`.
  - `apps/web/src/pages/CreatePage.test.tsx`:
    - AC1 / TR-21: empty street, zip `8526` and state `XX` in one submit → three field
      messages, zero `CreateProperty` requests (recorder); a valid lowercase state is not
      flagged. A pasted 6-digit zip `852681` → "must be 5 digits", zero requests.
    - AC2: valid input → the button is disabled while a delayed handler is pending; the
      recorded variables are the normalized address; then the stub details route for the
      returned id is shown.
    - AC3 / TR-19: `it.each` over the four codes → the code's key fact on screen (case-
      insensitive regex), and all four
      inputs still hold the typed values; mismatch shows the API message with both states.
    - AC4 / TR-19: `BAD_USER_INPUT` with `fields` for `zipCode` and `state` → each message is
      the accessible description of its input; no form-level alert.
    - A network error → the generic message, values kept.
  - `apps/web/src/app/routes.test.tsx`: unchanged unless the heading test needs the new
    page's markup (it should not).
  - `context/test-plan.md`: TR-19 and TR-21 status → `covered (S-05)` with the test files.
- Proves: FR-13 AC1, AC2, AC3, AC4 (component level: Testing Library + MSW); TR-19 page part,
  TR-21.
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm vitest run --project web`, `pnpm test:unit`.
- Human checks: in `pnpm dev` with a real key: create a Zillow address and land on its details
  page; create it again → "already exists" with the values kept; submit with an empty street /
  `XX` / `8526` → field messages and no network request (DevTools); keyboard-only fill and
  submit; the pending state is visible during the real Weatherstack call.

## Risks and unknowns

- Resolved: form reset by React 19 actions (use `onSubmit`); zod 4 field-error API
  (`z.flattenError`); where the mismatch region comes from (the API message).
- "No request sent" is proven by a recorder handler asserting zero calls, not by
  `onUnhandledFrame: 'error'`, which only rejects the request (resolved, plan-review #2).
- Pending-state assertion races a fast handler: use MSW `delay()` (or a deferred promise
  resolved by the test) so the disabled button is observable deterministically.
- Real Weatherstack behaviour (mismatch text for real addresses, quota) is only seen in the
  human check; no automated test calls it (CLAUDE.md).

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Create error messages and hook (afe3150)
- [x] Phase 2: Create property page (a2eb681)

## Deviations

- Phase 2, `context/test-plan.md`: the plan says set TR-19 / TR-21 to `covered (S-05)` "with
  the test files"; every other row's status holds only the slice, and the approach column
  already names the tests. Kept the existing format: `covered (S-05)`.
