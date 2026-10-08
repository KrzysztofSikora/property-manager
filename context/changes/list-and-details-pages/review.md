# Review: list-and-details-pages

Verdict: APPROVE WITH FOLLOW-UPS
Gates: typecheck ok, lint ok, tests 519 passed / 0 failed (`pnpm test`, 37 files, Docker
running). Also ok: `pnpm format:check`, `pnpm codegen` (no drift).

Base: `3ecbed6` (parent of `4167fe4`, the first `(list-and-details-pages)` commit). No
uncommitted changes.

## Plan vs diff

| File | Status | Note |
|------|--------|------|
| `apps/web/package.json`, `pnpm-lock.yaml` | done | `@property-manager/shared` `workspace:*`, `@testing-library/user-event` ^14.6.7 (dev). |
| `apps/web/src/test/setup.ts` | done | `showModal` / `close` polyfill; `close` fires `close`. |
| `apps/web/vitest.config.ts` | done | `test.env.TZ = 'UTC'`, logged under *Deviations* (TZ pin). |
| `apps/web/src/test/fixtures.ts` | done | `propertyFixture`, `listItem`. |
| `apps/web/src/test/msw.ts` | done | Default `Properties` (empty) / `Property` (`null`); `Health` removed. |
| `apps/web/src/components/ApiStatus.tsx`, `ApiStatus.test.tsx` | done | Deleted. |
| `apps/web/src/app/Layout.tsx` | done | No `ApiStatus`. |
| `apps/web/src/main.tsx` | done | `queries.retry: false`. |
| `apps/web/src/lib/format.ts`, `format.test.ts` | done | Shared `Intl.DateTimeFormat`, en-US medium/short. |
| `apps/web/src/hooks/useProperties.ts` | done | Key `['properties','list',{filter,sort}]`, no `limit`, blanks dropped, `keepPreviousData`. |
| `apps/web/src/pages/ListPage.tsx`, `ListPage.test.tsx` | done | Sort, filter form with `maxLength`, states, row links, Delete per row. |
| `apps/web/src/app/routes.test.tsx` | done | "API: ok" dropped; details row expects "Property not found" (phase 1 deviation closed in phase 3). |
| `apps/web/src/graphql/gql.ts`, `graphql.ts` | done | Regenerated; no `Health`; `pnpm codegen` leaves no diff. |
| `apps/web/src/lib/graphql-errors.ts`, `graphql-errors.test.ts` | done | `errorCode(error: unknown)`, first error only, checked against `ERROR_CODES`. |
| `apps/web/src/hooks/useDeleteProperty.ts` | done | Invalidates `['properties','list']`, removes the inactive exact detail entry; returns the promise (logged deviation). |
| `apps/web/src/components/DeletePropertyDialog.tsx`, `.test.tsx` | done | Mounted = open; `onNotFound` prop is a logged phase 3 deviation. |
| `apps/web/src/hooks/useProperty.ts` | done | Every field except `raw`; key `['properties','detail',id]`. |
| `apps/web/src/pages/DetailsPage.tsx`, `DetailsPage.test.tsx` | done | Found / not found / loading / error, AC2 note, delete → `/`. |
| `context/test-plan.md` | done | TR-20 `covered (S-04)` with new approach text; Cookbook web notes. |
| `apps/web/src/lib/execute.test.ts` | unplanned | Logged deviation: `HealthDocument` → `PropertiesDocument`, same cases. |
| `apps/web/src/hooks/useDeleteProperty.test.tsx` | unplanned | Added by the mutation check (`mutation.md`). |
| `context/changes/list-and-details-pages/{plan,plan-review,mutation}.md`, `context/roadmap.md`, `ai-sessions/49-54-*.txt` | unplanned | Process artifacts and session exports. |

## Areas

| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | concern | All Must ACs are met and tested, but Cancel/Esc during an in-flight delete leaves the details page showing the deleted property (R1). |
| Design | ok | pages → hooks → `execute()`; hierarchical keys; cache rule from the plan review implemented as decided. |
| Safety | ok | No secrets; `execute` parses the response with zod; error codes narrowed against `ERROR_CODES`; filter lengths capped in the form. |
| Tests | concern | Behaviour-level tests with MSW-recorded requests; `mutation.md` decisions are plausible. "Updating…" re-fetch state is untested (R3). |
| Simplicity | ok | Small hooks and components, no dead code found. |
| Plan fidelity | concern | Every deviation is logged, but the mutation run targeted modules not in the test plan's *Mutation targets* (R4). |

## Findings

### R1: Cancel or Esc during a pending delete leaves the deleted property on the details page
- Severity: major
- Where: `apps/web/src/components/DeletePropertyDialog.tsx:74-80` (Cancel stays enabled; only
  Delete has `disabled={deleteProperty.isPending}` at `:84`), `apps/web/src/pages/DetailsPage.tsx:108`
- Problem: Closing the dialog while `DeleteProperty` is in flight unmounts it, so the
  `mutate(..., { onSuccess })` callback never runs (TanStack skips per-call callbacks after the
  observer unmounts) and `onDeleted` never navigates. The hook deliberately does not refetch the
  active detail query, so the page keeps showing the property as if it still existed, with a
  live Delete button. Verified with a throwaway test (deleted afterwards): details page, Delete,
  confirm with a 100 ms handler, click Cancel; 400 ms later MSW had recorded the delete of
  `id-9` and the `<h1>` still read "15528 E Golden Eagle Blvd". A second Delete then hits
  `PROPERTY_NOT_FOUND` and navigates. On the list page the same race is harmless (the hook still
  invalidates the list).
- Fix: Do not let the dialog close while the mutation is pending: disable Cancel when
  `deleteProperty.isPending`, and `preventDefault()` the dialog's `cancel` event (Esc) in that
  state. Add a dialog test: while pending, Cancel is disabled and `onClose` is not called.
- Effort: small
- Decision: fix: Cancel is disabled and the dialog's `cancel` event (Esc) is prevented while the delete is pending; new dialog tests check both, and that Esc is not held off otherwise.

### R2: Going Back after a delete from the details page shows the deleted property from cache
- Severity: minor
- Where: `apps/web/src/hooks/useDeleteProperty.ts:16-23`, `apps/web/src/pages/DetailsPage.tsx:46`
- Problem: The active detail entry is (by design) left alone at delete time, and it is never
  removed after the page navigates away; it stays cached for the default `gcTime` (5 min). Browser
  Back to `/properties/<id>` renders the deleted property from cache, then the background refetch
  switches to "Property not found". Verified with a throwaway test (`MemoryRouter` history
  `['/', '/properties/id-9']`, delete, `navigate(-1)`): first render showed the street heading
  with the cached `{ property: { id: 'id-9', ... } }`, then "Property not found" after the
  refetch. The plan accepted "garbage-collected as usual", but this is the reverse of the flash
  it set out to avoid.
- Fix: Once the details page has left, drop the entry: e.g. in `DetailsPage`, set a ref on
  `onDeleted` / `onNotFound` and in an unmount cleanup call
  `queryClient.removeQueries({ queryKey: ['properties','detail',id], exact: true })`. Add a test
  with a two-entry history that goes Back and never sees the street heading.
- Effort: small
- Decision: fix: `DetailsPage` marks the property gone in `backToList` and removes its exact detail entry in an unmount cleanup; new test goes Back with the re-request held and sees "Loading property…", never the street, then "Property not found".

### R3: The "Updating…" re-fetch state is not tested
- Severity: minor
- Where: `apps/web/src/pages/ListPage.tsx:124`, `apps/web/src/pages/ListPage.test.tsx`
- Problem: The plan's decision "Loading indicator during re-fetch" says the table stays on
  screen and an "Updating…" status shows while `isPlaceholderData`. No test mentions
  "Updating" (grep), and the sort/filter tests do not check that the old rows remain while the
  new request is pending. Removing `placeholderData: keepPreviousData` (the page would flash
  "Loading properties…" on every apply) would survive the tests that exist. `useProperties.ts`
  was a mutation target, but its `ObjectLiteral` mutant on the options was a timeout (hang), not
  a check of this behaviour.
- Fix: In the FR-11 AC2 test, delay the second `Properties` response and assert that the old
  rows and a `status` "Updating…" are shown, then that the status is gone after the response.
- Effort: small
- Decision: fix: new FR-11 AC2 test holds the `CREATED_AT_ASC` response and checks the old rows and the "Updating…" status, then the new order with no status. Fails without `keepPreviousData`.

### R4: Stryker ran on modules that are not in the test plan's Mutation targets
- Severity: minor
- Where: `context/changes/list-and-details-pages/mutation.md:3-4`, `context/test-plan.md:98-110`
- Problem: CLAUDE.md says "Run Stryker only on the targets listed in `context/test-plan.md`".
  The run mutated `graphql-errors.ts`, `useProperties.ts`, `useDeleteProperty.ts` and
  `ListPage.tsx:9-43`, none of which is listed; `mutation.md` itself notes this and only
  suggests adding them later. The run was useful (it found real gaps), but the rule and the
  practice now disagree.
- Fix: Add `graphql-errors.ts`, `useProperties.ts` and `useDeleteProperty.ts` to *Mutation
  targets* via `/test-plan`, with this run as the baseline (95.0 / 95.5 / 100%), as
  `mutation.md` proposes. Or, if one-off checks of non-targets are wanted, amend the CLAUDE.md
  rule to allow them with a recorded reason.
- Effort: small
- Decision: fix: `graphql-errors.ts` (100%), `useProperties.ts` (95.0%) and `useDeleteProperty.ts` (95.5%) added to *Mutation targets* in `context/test-plan.md` with this run as the baseline (per-file scores from the Stryker report). `ListPage.tsx` stays an occasional check.
