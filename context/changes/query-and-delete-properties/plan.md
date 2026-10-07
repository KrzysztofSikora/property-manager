# Plan: query-and-delete-properties (S-03)

## Goal and end state

Properties can be listed, sorted, filtered, optionally paged, fetched one by one and deleted
through GraphQL, and none of these operations calls Weatherstack (issue #5). When S-03 is done:

- FR-01 AC1–AC6: `properties` returns `{ items, totalCount }`. Without `limit` it returns every
  match. `limit` must be 1–100 and `offset` must be ≥ 0, otherwise the response is
  `BAD_USER_INPUT` with no `items`. The weather adapter is called 0 times.
- FR-02 AC1–AC3: the default sort is `CREATED_AT_DESC` and `CREATED_AT_ASC` is available. Ties on
  `createdAt` are broken by `id` in the same direction, so pages never overlap and never skip
  a row.
- FR-03 AC1–AC6: `city` is a case-insensitive contains match, with `%`, `_` and `\` matched
  literally. `state` is upper-cased and matched exactly, and `zipCode` is matched exactly.
  Filters combine with AND and are applied before sorting and paging. `totalCount` counts the
  matches only, and a blank filter value is ignored.
- FR-04 AC1–AC4: `property(id)` returns every stored field, or `null` without `errors` for an
  unknown or malformed id, with 0 weather calls.
- FR-09 AC1–AC3: `deleteProperty(id)` returns the deleted id. After that, `property(id)` is
  `null` and `totalCount` is one lower. An unknown or malformed id returns
  `PROPERTY_NOT_FOUND`. 0 weather calls.
- FR-10 AC1 holds for `PROPERTY_NOT_FOUND`, and for `BAD_USER_INPUT` on the `properties`
  arguments.
- FR-08 AC3 is proven end to end: create → `deleteProperty` → create the same address
  succeeds.
- Test-plan rows TR-04, TR-07, TR-13, TR-14 and TR-15 are `covered`.

## Scope

- In:
  - SDL: `properties(filter, sort, limit, offset): PropertyPage!`, `PropertyFilter`,
    `PropertySort`, `PropertyPage`, and `deleteProperty(id: ID!): ID!`. Codegen output
    committed.
  - The `properties` args zod schema in the API GraphQL layer, with a unit table.
  - Repository `list` (rows and count in one read-only repeatable-read transaction) and
    `deleteById`. Service `list` and `delete`. `PropertyNotFoundError`.
  - Integration tests for every AC above. The existing `property(id)` integration tests move
    to the new test file and are renamed after the FR-04 ACs.
  - Test-plan updates: row statuses, the mutation-target path of the args schema, and the
    TR-13 escaping note.
- Out:
  - UI (S-04). The web codegen picks up the new types, but no web document uses them yet.
  - Cursor pagination, other sort keys, other filter fields, and partial or prefix zip matches
    (PRD: exact match).
  - Soft delete and undo (A-05: a delete is permanent).
  - Moving the args schema to `packages/shared` for the later URL-filter item (#9). See
    *Decisions*.

## Findings

Repo state (`e3c046c`):

- `apps/api/schema.graphql:44-57`: `Query` has `health` and `property(id: ID!): Property`.
  `Mutation` has only `createProperty`. Its description lists only three error codes (S-02
  added more). Fixing that is a one-line description edit and harmless, so it goes into
  phase 2.
- `apps/api/src/graphql/resolvers.ts:7,17-20`: `propertyId = z.uuid()`. A malformed id returns
  `null` before the service is called. `deleteProperty` reuses `propertyId`.
- `apps/api/src/services/property.service.ts:5-8,45-47`: `PropertyService` has `create` and
  `getById`. `getById` is a pass-through.
- `apps/api/src/domain/ports.ts:9-15`: `PropertyRepository` has `existsByAddress`, `insert` and
  `findById`. `InMemoryPropertyRepository` (`apps/api/test/fakes/property-repository.ts`)
  implements the port, so it must get every new method, or `tsc` fails.
- `apps/api/src/repositories/property.repository.ts:13-22`: `toProperty(row)` maps a row to the
  domain object and is reused for list rows. `findById` uses `eq(properties.id, id)` on a value
  the resolver has already validated.
- `apps/api/src/db/schema.ts:22-27`: `id uuid DEFAULT uuidv7()`, and `created_at timestamptz
  DEFAULT now()`. No index on `created_at`. For the brief's data volumes a sequential scan is
  fine, and no migration is needed.
- `apps/api/src/domain/errors.ts`: `DomainError` subclasses carry `code` and a client-safe
  message. `maskError` (`graphql/errors.ts:62-75`) maps any `DomainError` to its code, so
  `PropertyNotFoundError` needs no change in `errors.ts`. Only the FR-10 AC1 table in
  `errors.test.ts:103-130` gains a row.
- `packages/shared/src/errors.ts:6`: `PROPERTY_NOT_FOUND` is already in `ERROR_CODES`.
- `badUserInput(issues)` (`graphql/errors.ts:13-25`) joins the zod path with `.`, so a filter
  issue is reported as `filter.city`.
- `packages/shared/src/address.ts:5`: `normalizeAddressText` (trim and collapse whitespace) is
  exported. Stored cities are normalized with it, so the city filter is normalized the same
  way.
- Test helpers: `seedProperty(db, overrides)` (`test/helpers/db.ts:29`) accepts
  `createdAt` and address overrides, and `countProperties` exists. `test/operations.ts` has
  `PROPERTY_FIELDS`, `CREATE_PROPERTY` and `PROPERTY`. `PROPERTIES` and `DELETE_PROPERTY` are
  added.
- `create-property.int.test.ts:324-333`: FR-08 AC3 currently deletes with a direct
  `app.db.delete`. S-03 switches it to `DELETE_PROPERTY`. `:336-…`: the `describe('property')`
  tests (malformed id, unknown id) move to the new file.
- Codegen (`codegen.ts`): `enumsAsTypes`, so `PropertySort` becomes a string union. Nullable
  GraphQL args are `Maybe<T>` (`T | null | undefined`), so the args schema must accept an
  explicit `null` as "not given".

Library facts:

- Drizzle 0.45 (context7, `drizzle-orm-docs` pg/transactions): `db.transaction(cb, {
  isolationLevel: 'repeatable read', accessMode: 'read only' })` (`PgTransactionConfig`).
  `and()` ignores `undefined` operands, so optional filters are passed as
  `cond ? expr : undefined` (guides/conditional-filters).
- PostgreSQL `ILIKE`: the default escape character is `\`. Values are sent as bind
  parameters, so the pattern is `%` + the value with `\`, `%` and `_` prefixed by `\` + `%`.
  No `ESCAPE` clause is needed.
- PostgreSQL 18 `uuidv7()` is time-ordered and monotonic within a session. The FR-02 tiebreak
  does not rely on that: it needs only a total order, which `(created_at, id)` gives.
- `DELETE … RETURNING id` (Drizzle `.delete().where().returning({ id })`) yields `[]` when no
  row matched, so the delete and the not-found check are one statement with no race.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How strictly are filter values validated? | Length caps only: each of `city`, `state`, `zipCode` may be at most 100 characters after trimming, otherwise `BAD_USER_INPUT` (`fields: ['filter.city']` etc.). No format checks: `state: "Arizona"` or `zipCode: "8526"` simply match nothing. | Filters behave like a search, as FR-03 AC3 requires for a partial zip. One cap for all three fields is a single rule that stops oversized input. | user |
| How are `items` and `totalCount` read so they agree? | Two queries (rows, Drizzle `count()`) with the same `WHERE`, in one `read only`, `repeatable read` transaction. | Both come from one snapshot, so a concurrent create or delete cannot make them disagree. A `count(*) OVER ()` window returns no count when the offset is past the end. | user |
| Where does the `properties` args schema live? | `apps/api/src/graphql/properties-args.ts`. | Matches the test-plan mutation target and the rule that input is validated at the resolver boundary. The URL-filter item (#9) can move it to `shared` when it needs it. | user |
| Phase split | Two phases: (1) `properties` with sort, paging and filters; (2) `property(id)` ACs and `deleteProperty`. | The user merged the proposed sort/paging and filter phases into one. | user |
| City filter normalization | `normalizeAddressText` (trim, collapse whitespace), then a contains match. | Stored cities are normalized this way, so `"fountain  hills"` must find "Fountain Hills". | research |
| State / zip filter normalization | State: trim and upper-case. Zip: trim. Both are exact matches. | FR-03 AC2, AC3. | PRD |
| Blank filter value | Ignored after trimming, as if it was not given. | FR-03 AC6. | PRD |
| `null` arguments | An explicit `null` for `filter`, a filter field, `sort`, `limit` or `offset` means "not given", and the defaults apply (`CREATED_AT_DESC`, offset 0, no limit). | GraphQL allows `null` for nullable args, and codegen types them `Maybe<T>`. Rejecting `null` would be a surprising contract. | research |
| Malformed id in `deleteProperty` | The resolver validates with `z.uuid()` and throws `PropertyNotFoundError` without calling the service. | Roadmap S-03 scope. It mirrors `property(id)`, and Postgres would reject the cast with a 22P02 error (TR-15). | roadmap |
| `deleteProperty` return type | `ID!`. On error `data` is `null` and `errors[0].extensions.code` is set. | Roadmap S-03 scope and FR-09 AC1. | roadmap |
| Service unit tests for `list` | None. `list` is a pass-through, so it is proved by integration tests. `delete` gets a service test, because the service decides that a missing row becomes `PropertyNotFoundError`. | Lesson "A service test must be able to fail through the service". Filtering and ordering are repository rules, proved against PostgreSQL. | lesson |
| `InMemoryPropertyRepository.list` | Rejects with "not supported by the in-memory fake". `deleteById` is implemented. | No service test needs `list`. A second implementation of filtering in the fake would only be tested against itself. | lesson |

## Design

### SDL (`apps/api/schema.graphql`)

```graphql
enum PropertySort { CREATED_AT_DESC  CREATED_AT_ASC }

input PropertyFilter { city: String  state: String  zipCode: String }

type PropertyPage { items: [Property!]!  totalCount: Int! }

type Query {
  properties(filter: PropertyFilter, sort: PropertySort = CREATED_AT_DESC,
             limit: Int, offset: Int = 0): PropertyPage!
  property(id: ID!): Property   # unchanged
}

type Mutation {
  deleteProperty(id: ID!): ID!
}
```

Each field gets a description in the existing style (rules, defaults, error codes).

### Domain types (`apps/api/src/domain/property.ts`)

- `PropertySort = 'CREATED_AT_DESC' | 'CREATED_AT_ASC'`
- `PropertyFilter = { city?: string; state?: string; zipCode?: string }` (normalized, blank
  values removed)
- `PropertyListQuery = { filter: PropertyFilter; sort: PropertySort; limit?: number; offset:
  number }`
- `PropertyPage = { items: Property[]; totalCount: number }`

### Args schema (`apps/api/src/graphql/properties-args.ts`)

`propertiesArgsSchema` parses the generated `QueryPropertiesArgs` into `PropertyListQuery`:

- `limit`: `null` / absent → `undefined`; otherwise an integer 1–100. Message: "must be between
  1 and 100".
- `offset`: `null` / absent → `0`; otherwise an integer ≥ 0. Message: "must be 0 or greater".
- `sort`: `null` / absent → `'CREATED_AT_DESC'`. GraphQL already rejects values outside the
  enum.
- `filter` (`null` / absent → `{}`), per field: `null` → absent. City → `normalizeAddressText`,
  state → trim + upper-case, zip → trim. Empty after that → absent. Longer than 100 → issue
  "must be at most 100 characters" at `filter.<field>`.
- Messages never echo the input (the FR-10 rule in `address.ts`).

### Data flow and errors

- `properties`: the resolver calls `propertiesArgsSchema.safeParse(args)`. On failure it throws
  `badUserInput(issues)`. Otherwise it calls `services.property.list(query)`, which calls
  `repository.list(query)`. The repository builds one `where` from the filter and runs, in a
  read-only repeatable-read transaction:
  rows `ORDER BY created_at <dir>, id <dir> OFFSET <offset> [LIMIT <limit>]` mapped with
  `toProperty`, then the count with the same `where`. The count uses Drizzle's `count()`
  (as `countProperties` in `test/helpers/db.ts` does), not a raw `sql\`count(*)\``: `pg`
  returns a raw `count(*)` (bigint) as a string, and `totalCount` must be a number.
  - City: `ilike(properties.city, '%' + escapeLike(city) + '%')`. `escapeLike(value)` is
    exported from the repository module and prefixes `\`, `%` and `_` with `\`.
  - State and zip: `eq(...)`.
- `property(id)`: unchanged code. New tests only.
- `deleteProperty(id)`: the resolver parses `propertyId`. If the id is malformed it throws
  `PropertyNotFoundError`, otherwise it calls `services.property.delete(id)`, which calls
  `repository.deleteById(id)` (returns `boolean`, from `DELETE … RETURNING id`). On `false`
  the service throws `PropertyNotFoundError`. On success it returns `id`.
- `PropertyNotFoundError` (`domain/errors.ts`): code `PROPERTY_NOT_FOUND`, message "No property
  with this id exists." The id is not echoed, matching FR-10's "no property with that id".
- Port additions (`domain/ports.ts`): `list(query: PropertyListQuery): Promise<PropertyPage>`
  and `deleteById(id: string): Promise<boolean>`. Service additions: `list(query)` and
  `delete(id): Promise<string>`.
- No weather client is touched on any of these paths. TR-04 asserts
  `app.weather.calls` is `[]` in every new integration test.

## Phases

### Phase 1: `properties` with sort, paging and filters

- Files:
  - `apps/api/schema.graphql`: add `PropertySort`, `PropertyFilter`, `PropertyPage` and
    `Query.properties`. Contract: the SDL above.
  - `apps/api/src/graphql/generated/resolvers-types.ts`, `apps/web/src/graphql/*`: regenerated
    with `pnpm codegen`.
  - `apps/api/src/domain/property.ts`: `PropertySort`, `PropertyFilter`, `PropertyListQuery`,
    `PropertyPage`.
  - `apps/api/src/graphql/properties-args.ts` (new): `propertiesArgsSchema`, whose output type
    is `PropertyListQuery`.
  - `apps/api/src/graphql/properties-args.test.ts` (new): unit table. FR-01 AC5 bounds
    (`limit` 0 / 1 / 100 / 101 / null / absent, `offset` -1 / 0 / null / absent, offset
    without limit), sort default and `null`, FR-03 AC6 (blank and whitespace-only → absent,
    filter `null`), FR-03 AC2 upper-casing, city whitespace collapse, zip trim, the 100/101
    character caps per field with the issue path, and messages that do not echo the input.
  - `apps/api/src/domain/ports.ts`: `PropertyRepository.list`.
  - `apps/api/src/repositories/property.repository.ts`: `list(query)` and the exported
    `escapeLike`. Contract: the rows and the count share the filter and one snapshot.
  - `apps/api/src/repositories/property.repository.test.ts`: `escapeLike` table (`%`, `_`, `\`,
    a mix, plain text unchanged).
  - `apps/api/src/services/property.service.ts`: `list(query)`, a pass-through.
  - `apps/api/src/graphql/resolvers.ts`: `Query.properties`.
  - `apps/api/test/fakes/property-repository.ts`: `list` rejects with "not supported by the
    in-memory fake".
  - `apps/api/test/operations.ts`: `PROPERTIES` (variables `filter`, `sort`, `limit`,
    `offset`; selects `items { ...PropertyFields }` and `totalCount`).
  - `apps/api/test/integration/query-properties.int.test.ts` (new): seeds through
    `seedProperty` with explicit `createdAt`. Every `seedProperty` call overrides `street`
    (through a small local `seedMany(n, overrides)` helper that numbers the street), so no
    seed trips `properties_address_unique`. The filter seeds do this too, not only the
    25-row seeds. Tests: FR-01 AC1 (all fields
    exposed), AC2, AC3 (25, no limit), AC4 (`limit: 10, offset: 20` → 5 of 25), AC5 through the
    API as an `it.each` over `{ limit: 0 }`, `{ limit: 101 }` and `{ offset: -1 }` (each →
    `BAD_USER_INPUT`, `data` null, `fields[0].field` is `limit` / `offset`), and
    `limit: 100` and offset-only succeed, AC6 / TR-04 (0 weather calls). FR-02 AC1, AC2, and AC3 / TR-14:
    25 rows with the same `created_at`, pages at offsets 0 and 20 (limit 20) hold all 25 ids
    once, in both directions, and the order equals the `id` order. The expected order is built with a
    plain code-unit comparison (`[...ids].sort()`, reversed for DESC), not `localeCompare` or a
    collator, which matches PostgreSQL's byte order for lowercase canonical UUIDs. FR-03 AC1–AC6, with
    `totalCount` checked in each. TR-13 extras: `city: "%"` and `city: "_"` match nothing,
    while a seeded city that contains `%` or `_` is matched by that literal character. An
    over-long filter returns `BAD_USER_INPUT` with `fields[0].field === 'filter.city'`.
- Proves: FR-01 AC1–AC6, FR-02 AC1–AC3, FR-03 AC1–AC6 (integration, Testcontainers). Arg rules
  are also covered by the unit table (TR-13 U, TR-14 U). FR-10 AC1 for `BAD_USER_INPUT` on
  `properties`.
- Agent checks: `pnpm codegen && git diff --exit-code -- apps/api/src/graphql/generated
  apps/web/src/graphql` (run after the regenerated files are staged or committed; fails on
  drift), `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test:unit`, `pnpm vitest run --project api-int`
- Human checks: in GraphiQL (`pnpm dev`), run `properties` with no args, with `sort:
  CREATED_AT_ASC`, and with `filter: { city: "fountain" }`, and check that the SDL
  descriptions read well in the docs pane.

### Phase 2: property details ACs and `deleteProperty`

- Files:
  - `apps/api/schema.graphql`: `Mutation.deleteProperty(id: ID!): ID!` with a description
    (errors: `PROPERTY_NOT_FOUND`). The `createProperty` description lists its current error
    codes.
  - Generated files: regenerated.
  - `apps/api/src/domain/errors.ts`: `PropertyNotFoundError` (code `PROPERTY_NOT_FOUND`).
  - `apps/api/src/domain/ports.ts`: `PropertyRepository.deleteById(id): Promise<boolean>`.
  - `apps/api/src/repositories/property.repository.ts`: `deleteById`, a single `DELETE …
    RETURNING id`.
  - `apps/api/src/services/property.service.ts`: `delete(id): Promise<string>`, which throws
    `PropertyNotFoundError` when nothing was deleted.
  - `apps/api/src/services/property.service.test.ts`: `PropertyService.delete` returns the id
    and removes the row from the fake. An unknown id throws `PropertyNotFoundError` (checked
    by its `code`, per the lesson).
  - `apps/api/src/graphql/resolvers.ts`: `Mutation.deleteProperty`. A malformed id throws
    `PropertyNotFoundError` without calling the service.
  - `apps/api/src/graphql/errors.test.ts`: a `PropertyNotFoundError` row in the FR-10 AC1
    table.
  - `apps/api/test/fakes/property-repository.ts`: `deleteById`.
  - `apps/api/test/operations.ts`: `DELETE_PROPERTY`.
  - `apps/api/test/integration/property-details-delete.int.test.ts` (new): FR-04 AC1 (seeded
    row; every field equals the stored values; any second seeded row overrides `street`), AC2 (unknown UUID → `null`, no `errors`), AC3
    (0 weather calls), AC4 (malformed id → `null`). These move from
    `create-property.int.test.ts`'s `describe('property')`. FR-09 AC1 (returns the id,
    `property` is then `null`, `totalCount` 2 → 1), AC2 / TR-15 (unknown UUID and malformed
    id → `PROPERTY_NOT_FOUND` with its message, count unchanged, no `unexpected error` log),
    AC3 (0 weather calls).
  - `apps/api/test/integration/create-property.int.test.ts`: the FR-08 AC3 test deletes
    through `DELETE_PROPERTY` instead of `app.db.delete`. The moved `describe('property')`
    is removed.
  - `context/test-plan.md`: TR-04, TR-07, TR-13, TR-14 and TR-15 set to `covered (S-03)`. The
    mutation target "the `properties` args schema" is named
    `apps/api/src/graphql/properties-args.ts`. TR-13 notes that `\` is escaped too.
- Proves: FR-04 AC1–AC4, FR-09 AC1–AC3, FR-08 AC3 end to end (integration). FR-10 AC1 for
  `PROPERTY_NOT_FOUND` (unit mapping table plus integration).
- Agent checks: `pnpm codegen && git diff --exit-code -- apps/api/src/graphql/generated
  apps/web/src/graphql` (as in phase 1), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:unit`, `pnpm test`
- Human checks: in GraphiQL, delete a created property, run `deleteProperty` again with the
  same id and see `PROPERTY_NOT_FOUND`, and check that the message wording reads well.

## Risks and unknowns

- Resolved: count and rows in one round trip vs two queries (roadmap unknown). Two queries in
  one read-only repeatable-read transaction (*Decisions*).
- Resolved: tiebreak semantics (RQ-02). `ORDER BY created_at, id` in the same direction. The
  TR-14 test forces equal `created_at` values, so it does not depend on clock resolution.
- Risk: the `escapeLike` backslash handling depends on `standard_conforming_strings` (on by
  default since PostgreSQL 9.1) only for literals. Bind parameters are not affected. The
  integration test with a literal `%`/`_` in a seeded city proves the real behaviour.
- Risk: `repeatable read` transactions add BEGIN/COMMIT round trips per list. This is
  acceptable at the brief's scale. Revisit only if S-04 shows latency.
- Risk: the in-memory fake's `list` rejects, so a future service test that needs listing gets
  a clear failure instead of silently wrong data. This is intended.
- No `BLOCKING` unknowns.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [ ] Phase 1: `properties` with sort, paging and filters
- [ ] Phase 2: property details ACs and `deleteProperty`

## Deviations

- Phase 1, TR-14 seeds. Plan says: 25 rows with the same `created_at`. Code shows: with the
  default `uuidv7()` ids, insertion order equals id order, so `CREATED_AT_ASC` passed with the
  `id` tiebreak removed. Consequence: the TR-14 rows get random v4 ids; both directions now
  fail without the tiebreak (checked by removing it).
- Phase 1, TR-13. Added an integration case for a literal `\` in the city filter, next to `%`
  and `_`, since `escapeLike` escapes it too.
- Phase 1, web codegen. `apps/web/src/graphql/*` did not change: the client preset emits only
  types that web documents use, and none uses the new ones yet (S-04).
