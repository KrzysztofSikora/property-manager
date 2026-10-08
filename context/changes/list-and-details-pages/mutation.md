# Mutation check: list-and-details-pages

Targets: `apps/web/src/lib/graphql-errors.ts`, `apps/web/src/hooks/useProperties.ts`,
`apps/web/src/hooks/useDeleteProperty.ts`, `apps/web/src/pages/ListPage.tsx:9-43` ·
Tests: `apps/web/vitest.config.ts` (jsdom + MSW, hermetic), `--concurrency 4`
Score: 82.61% -> 92.39% (before 71 / 16 / 0 / 5, after 80 / 7 / 0 / 5; killed / survived /
no coverage / timeout)

The plan said S-04 needs no `/mutation` step because it leaves `execute.ts` unchanged. The
change still adds logic that the skill's criteria cover, so these four were run:

- `graphql-errors.ts`: error mapping. It decides which `extensions.code` the UI acts on.
- `useProperties.ts`: query building. Blank filters are dropped and values trimmed.
- `useDeleteProperty.ts`: the cache rule from the plan review (what a delete invalidates or
  removes).
- `ListPage.tsx:9-43`: the sort guard, reading the filter form, and the "filtered" flag that
  picks the empty state.

Skipped: `format.ts` (a thin wrapper around `Intl`), `DetailsPage.tsx` and
`DeletePropertyDialog.tsx` (presentation and wiring), and the generated `graphql/*`.

The 5 timeouts were re-run alone at `--concurrency 1`. 3 still time out and 2 are killed, so
no survivor is hidden behind load (lessons: timeouts). The 3 are real hangs: an empty query
document or an empty `useQuery` options object leaves the page loading.

## Mutants

| File:line | Mutator | Change | Decision | Note / test added |
|-----------|---------|--------|----------|-------------------|
| `useDeleteProperty.ts:17` | ArrayDeclaration | `removeQueries` key `[]` | strengthen | Removes every inactive query, including other properties' details. New `hooks/useDeleteProperty.test.tsx`: the deleted id's cached details are gone, and another id's details are kept. |
| `useDeleteProperty.ts:17` | StringLiteral ×2 | `'properties'` / `'detail'` → `''` | strengthen | The removal matches nothing, so stale details of a deleted property show when its page is reopened. Same test. |
| `useDeleteProperty.ts:18` | BooleanLiteral | `exact: false` | equivalent | No query key extends `['properties', 'detail', id]`, so a prefix match removes the same single query. |
| `useProperties.ts:27` | MethodExpression | `if (city.trim())` → `if (city)` | strengthen | A whitespace-only city is sent as `city: ""` instead of being left out. New `it.each(['City', 'Zip code'])` in `ListPage.test.tsx` (FR-11 AC6): the request has `filter: {}`. |
| `useProperties.ts:29` | MethodExpression | `if (zipCode.trim())` → `if (zipCode)` | strengthen | Same as for city. Same parametrised test. |
| `useProperties.ts:29` | MethodExpression | `zipCode.trim()` → `zipCode` in the sent value | equivalent | The API trims the zip filter (`properties-args.ts:22`), and `maxLength={5}` means a padded zip is a partial zip, which matches nothing either way. Results cannot differ. |
| `ListPage.tsx:12` | ObjectLiteral / StringLiteral ×2 | "Newest first" option → `{}`, value `""`, label `""` | strengthen | The user cannot switch back to newest first (or the option has no label). The FR-11 AC2 test now goes back to "Newest first" and checks the order and the third request's `CREATED_AT_DESC`. |
| `ListPage.tsx:17` | ConditionalExpression | `isPropertySort` → `true` | equivalent | The select only offers the listed values. The guard narrows the type, and no input reaches its false branch. |
| `ListPage.tsx:17` | EqualityOperator | `===` → `!==` | equivalent | With two options, `some(!==)` is true for every value, which is the same as the `true` mutant above. |
| `ListPage.tsx:22` | ConditionalExpression | `typeof value === 'string'` → `true` | equivalent | All three fields are text inputs or a select, so `FormData.get` always returns a string. |
| `ListPage.tsx:22` | StringLiteral | fallback `''` → `"Stryker was here!"` | equivalent | It is only reached for a non-string value, which never happens (see above). |
| `ListPage.tsx:34` | CallExpression | `event.preventDefault()` removed | accept | In a browser the form would GET-reload the page and lose the filters. jsdom does not navigate, so a unit test could only check `defaultPrevented`, which mirrors the implementation. Belongs to E2E (S-06), see below. |
| `ListPage.tsx:43` | MethodExpression | `value.trim() !== ''` → `value !== ''` | strengthen | A whitespace-only filter shows "No properties match the filters" for an unfiltered empty list. Same parametrised test: it shows "No properties yet". |

## Dead-weight tests

None found. The command runner reruns the whole suite per mutant, so Stryker cannot say which
test killed what. From reading the tests, none repeats another with only the input changed.
The new whitespace case is one `it.each` over City and Zip code, not two copies.

## Gaps for the test plan

- The filter form not reloading the page (`ListPage.tsx:34`, `preventDefault`) can only be
  observed in a real browser. Add it to the S-06 Playwright list-filter scenario.
- `useProperties.ts`, `useDeleteProperty.ts` and `graphql-errors.ts` are not in
  *Mutation targets*. Suggest adding them via `/test-plan`, with this run as the baseline
  (95.0%, 95.5%, 100%). `ListPage.tsx:9-43` is a line range inside a page, so it fits better as
  an occasional check than as a standing target.
