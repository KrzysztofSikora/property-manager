# Plan: create-property-with-weather (S-01)

## Goal and end state

`createProperty(street, city, state, zipCode)` validates and normalizes the address, calls
Weatherstack once, and stores the property with its weather snapshot and coordinates. This is
the happy path from end to end (issue #3). When S-01 is done:

- FR-05 AC1: a valid input returns the new property with a generated `id`, the normalized
  address, numeric `lat`/`long` from `location.lat`/`location.lon`, and
  `weatherData { units: IMPERIAL, current }`. `current.raw` deep-equals the response's
  `current`, and the typed key fields equal their source values. `createdAt` is set by the
  server. A following `property(id)` returns the same data. A minimal `property(id)` is pulled
  forward from S-03 for this (see *Decisions*).
- FR-05 AC2: the weather adapter is called exactly once, with
  `"<street>, <city>, <state> <zipCode>, United States"` built from the normalized fields, and
  with `units=f`.
- FR-05 AC3: `"  15528  E Golden Eagle Blvd "` / `"az"` are stored as
  `"15528 E Golden Eagle Blvd"` / `"AZ"`.
- FR-05 AC6: a rejected save returns `INTERNAL_SERVER_ERROR` and leaves no row.
- FR-07 AC1–AC5: invalid fields return one `BAD_USER_INPUT` error listing every invalid field
  in `extensions.fields` as `{ field, message }`, and the weather adapter is called 0 times.
  `"02108"` is kept as a string.
- FR-10 AC2: an unexpected exception returns `INTERNAL_SERVER_ERROR` with a generic message. It
  contains no stack trace, SQL, file path or key, even when `NODE_ENV=development`.
- An interim failure path, refined by S-02: any adapter failure (non-2xx, network error,
  timeout, `success: false`, a body that fails the schema) returns `WEATHER_UNAVAILABLE`, and
  no key appears in the response or the logs.

## Scope

- In:
  - `packages/shared`: the address zod schema and `normalizeAddress`, used by the API now and
    by the web form in S-05.
  - `apps/api/src/domain/`: the `Property` / `WeatherReport` types, the ports
    (`PropertyRepository`, `WeatherClient`), the domain errors, and the key-field schema of
    `current`.
  - The Weatherstack adapter (happy path plus a single `WeatherUnavailableError` for every
    failure), `redact.ts`, MSW handlers and `FakeWeatherClient` (including `withBarrier`).
  - `PropertyRepository.insert` / `findById`, and `PropertyService.create` / `getById`.
  - The SDL (`Property`, `WeatherData`, `WeatherUnits`, `CurrentWeather`, `createProperty`,
    `property(id)`), `graphql-scalars` (`JSON`, `DateTime`), codegen, resolvers, the error
    formatter and masking, and the composition root.
  - Test helpers: the `weather` (and `repository`) options of `createTestApp`,
    `test/operations.ts` and `expectGraphQLError`. The Cookbook loses its *(S-01)* markers.
- Out:
  - Classifying weather errors (104 → `WEATHER_QUOTA_EXCEEDED`, the 101/105 config log, the
    full MSW failure matrix, 429, the timeout timing test). That is S-02.
  - The region check (FR-05 AC4), the duplicate pre-check and the `23505` mapping (FR-08), all
    S-02. Until then a duplicate insert returns `INTERNAL_SERVER_ERROR`.
  - `properties(...)` list/filter/sort, `deleteProperty`, and the FR-04 AC tests for
    `property(id)` (S-03). S-01 builds only the read path that FR-05 AC1 needs, including
    "malformed id → `null`".
  - Typed non-key `CurrentWeather` fields, `astro` and `airQuality` (Later #11/#12). They stay
    available in `raw`.
  - Web UI (S-04, S-05).

## Findings

Repo state (`bd742be`):

- `apps/api/schema.graphql:1-4`: only the placeholder `health` query.
- `apps/api/src/app.ts:77-88`: `createApp({ config, logger })` builds Yoga with
  `logging: false` and no `maskedErrors` option. The comment says "S-01 wires services,
  repositories and adapters here". It has no database and no adapters.
- `apps/api/src/main.ts:19-21`: builds config, logger and app. It never creates the DB pool.
- `apps/api/src/db/schema.ts:13-14`: `WeatherSnapshot = { units: 'IMPERIAL'; current:
  Record<string, unknown> }`, with the comment "S-01 narrows `current`". `db/schema.ts:38-45`:
  `properties_address_unique` is on `lower(street), lower(city), state, zip_code`. The CHECKs
  on state, zip, lat/long and weather_data shape are a backstop.
- `apps/api/src/db/client.ts:10-16`: `createDb(url)` returns `{ db, close }`.
- `eslint.config.ts:49-78`: layer rules. `graphql/**` may not import repositories, adapters,
  db, drizzle or pg. `services/**` may not import graphql, db, graphql-yoga, graphql, drizzle or
  pg. `repositories/**` may not import services or graphql. `adapters/**` may not import
  services, graphql or db. **No rule covers a neutral module**, so `src/domain/**` needs one,
  and ports cannot live in `services/` because adapters may not import services.
- `codegen.ts:7-15`: the server plugins use `enumsAsTypes`, `useTypeImports` and
  `contextType`. No `scalars` or `mappers` are configured yet.
- `apps/api/test/helpers/app.ts:28-53`: `createTestApp()` has no `weather` option yet. It
  creates the DB, but `createApp` does not receive it.
- `apps/api/test/fixtures/property.ts:1-2`: `PropertyInput` is a placeholder, to be "replaced
  with the type inferred from the address zod schema" in S-01.
- `apps/api/test/fixtures/weatherstack.ts`: `weatherstackResponse(overrides)` (deep-merge,
  `undefined` removes a key) and `weatherstackError(code, type, info?)` exist.
- `apps/api/test/setup/msw.ts`: `setupServer()` with no default handlers and
  `onUnhandledFrame: 'error'`.
- `packages/shared/src/states.ts:56-63`: `StateCode`, `isStateCode` (case-sensitive) and
  `stateName`. `packages/shared/package.json` has **no zod dependency** yet.
- `docs/samples/weatherstack-current.json`: in `current`, `temperature`, `feelslike`,
  `wind_speed` and `humidity` are integers, `weather_descriptions` and `weather_icons` are
  string arrays, and `wind_dir` is a string. `location.lat`/`lon` are decimal strings
  (`"33.609"`, `"-111.729"`), and `location.region` is `"Arizona"`. `air_quality` values are
  strings with hyphenated keys (`us-epa-index`).

Library facts:

- **Yoga masking** (`graphql-yoga@5.24.2`, `cjs/utils/mask-error.js`, and the context7 docs on
  `maskedErrors.maskError`): a `GraphQLError` passes through unchanged if its `originalError`
  chain contains only `GraphQLError`s (`isOriginalGraphQLError` recurses, `cjs/error.js:20-28`).
  This matters because graphql 17's `locatedError` wraps a resolver-thrown `GraphQLError` in a
  new `GraphQLError` whose `originalError` is the thrown one. Anything else becomes `"Unexpected error."` with `extensions: { code: 'INTERNAL_SERVER_ERROR',
  unexpected: true }`. **When `NODE_ENV === 'development'`, the default `maskError` adds
  `extensions.originalError` with `message` and `stack`**, which would break FR-10 AC2 in dev.
  So S-01 passes a custom `maskedErrors.maskError` that never forwards `isDev`.
- **graphql-scalars 2.0.0** declares the peer `graphql: ^16.0.0 || ^17.0.0` (`npm view`).
  `JSONResolver` and `DateTimeResolver` are exported. `DateTime` serializes a `Date` to an
  ISO 8601 string.
- **zod 4** (already `^4.6.5` in `apps/api`): `issue.path[0]` gives the field name for
  `extensions.fields`. `z.looseObject` keeps unknown keys, so the parsed `current` still holds
  every field for `raw`. `z.coerce.number()` turns `""` into `0`, so `lat`/`lon` are parsed with
  a decimal regex and `Number`, not with coerce.
- **`AbortSignal.timeout(5000)`** rejects `fetch` with a `TimeoutError` `DOMException`. A
  `fetch` `TypeError` (network) does not include the URL in its message. Its `cause` may,
  though, so the adapter never attaches the raw error as `cause` without redacting it first.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How S-01 proves "a following `property(id)` returns the same data" (FR-05 AC1) | Add a minimal `property(id: ID!): Property` now: repository `findById`, service `getById`, and a resolver. A malformed id returns `null` without a DB query. | AC1 is then proven through the API, and S-01 can be demoed in GraphiQL. S-03 keeps the FR-04 AC tests, the list and delete. | user |
| Adapter failure result before S-02 | Every adapter failure throws `WeatherUnavailableError`, which maps to `WEATHER_UNAVAILABLE`. | Correct per FR-06 for most cases. S-02 only adds quota, the config log and the full failure matrix. | user |
| JSON / DateTime scalars | `graphql-scalars` (`JSONResolver`, `DateTimeResolver`). Codegen maps `JSON` to `unknown` and `DateTime` to `Date` (output `Date \| string`). | A maintained package that supports graphql 17. No scalar code of our own to test or mutate. | user |
| `BAD_USER_INPUT` `extensions.fields` shape | `fields: [{ field, message }]`, one entry per invalid field. The top-level message names every field. | S-05 shows each field's reason directly. FR-07 AC5 is satisfied with one error. | user |
| Phase split | 4 phases: shared address schema; adapter; repository + service; GraphQL wiring | Each phase is one reviewable diff. | user |
| Mutation argument style | Flat arguments `createProperty(street, city, state, zipCode)` | PRD FR-05 and C-05 name them as mutation arguments. | research (PRD) |
| Nullability of `createProperty` / `property` | `createProperty(...): Property` and `property(id: ID!): Property`, both nullable | The PRD convention says an error code means the *field* is `null`. A non-null return type would null the whole `data` instead. | research (PRD) |
| Where ports and domain types live | `apps/api/src/domain/` (types, ports, errors, key-field schema). Every layer may import it, and it imports nothing from the layers. An ESLint block enforces this. | Adapters and repositories may not import `services/**`, so the ports cannot live there. This is the ports-and-adapters pattern: the service depends on interfaces, and the composition root wires real or fake implementations (NFR-07). | research |
| Where `current` is mapped to the typed fields | The domain function `toCurrentWeather(raw)` zod-parses the key fields (snake_case) and returns the camelCase fields plus `raw`. The adapter uses it to validate the response. The repository uses it when mapping a row to a domain `Property`. | One schema for "what a valid `current` is". Resolvers then return domain objects as they are, so no codegen mappers are needed. | research |
| Error model | Domain errors in `domain/errors.ts` (`WeatherUnavailableError` now, more in S-02). Each one carries an `ErrorCode` from `@property-manager/shared` and a safe message. The resolver throws `BAD_USER_INPUT` as a `GraphQLError`. `graphql/errors.ts` provides `maskError`, which walks the `originalError` chain to the first non-`GraphQLError`: a `DomainError` becomes a `GraphQLError` with its code. A chain that ends in a `GraphQLError` (such as a wrapped `BAD_USER_INPUT`) passes through. Everything else becomes `INTERNAL_SERVER_ERROR` / "Unexpected error.", and the original is logged at `error` level. | A single place maps codes (TR-12, a mutation target). It also covers errors that Yoga wraps. | research |
| Validation location | The resolver parses the arguments with the shared `addressSchema` (trim, collapse, upper-case state, then the rules) and passes the normalized `Address` to the service. | CLAUDE.md and NFR-05: validate at the boundary. FR-07 says before any weather call. | research (CLAUDE.md) |
| `lat`/`lon` parsing | `z.string().regex(/^-?\d+(\.\d+)?$/)` then `Number`. No range check in zod; the DB CHECK is the backstop. | `z.coerce` accepts `""` as `0`. FR-06 AC5 asks only for "numeric". | research |
| Composition | `createApp({ config, logger, repository, weather })` takes ports. `main.ts` builds the pool, the Drizzle repository and the `WeatherstackClient`. `createTestApp({ weather?, repository? })` does the same with a fake (default), `'msw'` (real client), or a repository override. | `createApp` stays testable without a DB. FR-05 AC6 and TR-12 need a repository whose `insert` throws. | research (test-plan Cookbook) |

## Design

### Shared (`packages/shared/src/address.ts`)

- `normalizeAddressText(s: string): string` trims the string and collapses runs of whitespace
  to one space.
- `addressSchema`: a zod object with four `z.string()` fields, normalized with string methods
  (not `z.preprocess`, whose input type is `unknown` and would make `AddressInput` untyped),
  then validated with our own messages (no echo of the input):
  - `street` and `city`: `z.string().trim().overwrite(normalizeAddressText)`, then 1–200 and
    1–100 characters.
  - `state`: `z.string().trim().toUpperCase().transform((s, ctx) => …)`, which returns `s`
    when the `isStateCode` type guard passes and otherwise adds an issue and returns
    `z.NEVER`. The output type is then `StateCode` with no cast (a `refine(isStateCode)` would
    not narrow it).
  - `zipCode` must match `^[0-9]{5}$` and stays a string.
  - `AddressInput` therefore has `string` for every field.
- `type AddressInput = z.input<typeof addressSchema>`, `type Address = z.output<typeof
  addressSchema>`.
- `normalizeAddress(input: AddressInput): Address` throws on invalid input. It is a thin
  wrapper over `addressSchema.parse` for callers that have already validated.
- `formatWeatherQuery` does **not** live here. Building the query string is service logic.
- `packages/shared/package.json` gets `zod` (same range as `apps/api`), and `index.ts`
  re-exports the new names.

### Domain (`apps/api/src/domain/`)

- `property.ts`:
  - `Property = Address & { id: string; lat: number; long: number; weatherData: WeatherData;
    createdAt: Date }`
  - `WeatherData = { units: 'IMPERIAL'; current: CurrentWeather }`
  - `CurrentWeather = { temperature: number; feelsLike: number; weatherDescriptions: string[];
    weatherIcons: string[]; windSpeed: number; windDir: string; humidity: number;
    raw: Record<string, unknown> }`
  - `NewProperty = Address & { lat; long; weatherData: StoredWeather }`, where
    `StoredWeather = { units: 'IMPERIAL'; current: Record<string, unknown> }`. This is what
    goes into the jsonb column, and `db/schema.ts` uses it in place of `WeatherSnapshot`.
- `weather.ts`:
  - `currentKeyFieldsSchema`: a loose zod object with the 7 snake_case key fields required
    (integers or string arrays as in the sample).
  - `toCurrentWeather(raw: unknown): CurrentWeather` throws a `ZodError` on failure. Callers
    decide what that means.
  - `WeatherReport = { lat: number; long: number; region: string; current:
    Record<string, unknown> }`
- `ports.ts`:
  - `WeatherClient { current(query: string): Promise<WeatherReport> }`
  - `PropertyRepository { insert(p: NewProperty): Promise<Property>; findById(id: string):
    Promise<Property | null> }`
- `errors.ts`:
  - `abstract class DomainError extends Error { abstract readonly code: ErrorCode }`, with
    explicit fields and no parameter properties.
  - `WeatherUnavailableError` (code `WEATHER_UNAVAILABLE`, the FR-10 message).

### Adapter (`apps/api/src/adapters/weatherstack/`)

- `redact.ts`:
  - `redactUrl(url: string | URL): string` replaces the value of `access_key` (first, middle or
    last parameter, URL-encoded or not) with `[REDACTED]`.
  - `redactText(text: string, key: string): string` replaces every occurrence of the key. It is
    used for error messages and causes.
- `response.ts`: `parseWeatherstackResponse(body: unknown): WeatherReport`. It requires
  `location.lat`/`lon` (decimal strings), `location.region` (a non-empty string) and `current`
  (validated with `toCurrentWeather`, and kept loose and whole). A body with `success: false`,
  or one that fails to parse, throws `WeatherUnavailableError`. The cause is only the zod issue
  paths, never the body.
- `client.ts`: `createWeatherstackClient({ baseUrl, accessKey, logger, fetch?
  = globalThis.fetch }): WeatherClient`. It sends
  `GET {baseUrl}/current?access_key=…&query=…&units=f` with `AbortSignal.timeout(5000)`, makes
  one attempt, and never retries. A non-2xx status, a network error, a timeout or a parse
  failure is logged at `warn` (with the redacted URL, the status or error name, and
  `redactText` on the message) and then throws `WeatherUnavailableError`.
- `test/msw/weatherstack.ts`: `weatherstackHandlers.ok(body?)` records requests for
  assertions.
- `test/fakes/weather.ts`: `class FakeWeatherClient implements WeatherClient`. It is built from
  a Weatherstack body (`weatherstackResponse()` by default) and runs it through
  `parseWeatherstackResponse`, so a broken fixture fails the same way the real client does.
  It also has `calls: string[]` and `static withBarrier(n, body?)`, which holds calls until `n`
  have arrived.

### Repository and service

- `repositories/property.repository.ts`: `createPropertyRepository(db: Database):
  PropertyRepository`. `insert` returns the inserted row mapped by `toProperty(row)`, which uses
  `toCurrentWeather(row.weatherData.current)`. `findById` returns the mapped row or `null`. DB
  errors propagate unchanged; mapping `23505` is S-02.
- `services/property.service.ts`: `createPropertyService({ repository, weather }):
  PropertyService`.
  - `create(address: Address): Promise<Property>` calls `weather.current(weatherQuery(address))`
    exactly once, then `repository.insert({ ...address, lat, long, weatherData: { units:
    'IMPERIAL', current } })`. `region` is ignored until S-02.
  - `getById(id)` delegates to the repository.
  - `weatherQuery(a) = \`${a.street}, ${a.city}, ${a.state} ${a.zipCode}, United States\``,
    exported for unit tests.

### GraphQL

- `schema.graphql`:

  ```graphql
  scalar JSON
  scalar DateTime
  enum WeatherUnits { IMPERIAL }
  type CurrentWeather { temperature: Int! feelsLike: Int! weatherDescriptions: [String!]!
    weatherIcons: [String!]! windSpeed: Int! windDir: String! humidity: Int! raw: JSON! }
  type WeatherData { units: WeatherUnits! current: CurrentWeather! }
  type Property { id: ID! street: String! city: String! state: String! zipCode: String!
    lat: Float! long: Float! weatherData: WeatherData! createdAt: DateTime! }
  type Query { health: String!  property(id: ID!): Property }
  type Mutation { createProperty(street: String!, city: String!, state: String!,
    zipCode: String!): Property }
  ```

  `health` stays, because the web `ApiStatus` component uses it.
- `codegen.ts`: `scalars: { JSON: 'unknown', DateTime: { input: 'Date', output: 'Date |
  string' } }` for the server output, and `scalars: { JSON: 'unknown', DateTime: 'string' }`
  for the web client output (otherwise both become `any` in `apps/web/src/graphql/`, a path
  ESLint ignores). Run `pnpm codegen` and commit the output.
- `graphql/context.ts`: adds `services: { property: PropertyService }`.
- `graphql/resolvers.ts`:
  - `createProperty` runs `addressSchema.safeParse(args)`. On failure it throws
    `badUserInput(issues)`. On success it calls `context.services.property.create(data)`.
  - `property` runs `z.uuid().safeParse(id)` and returns `null` on failure. Otherwise it calls
    `getById`.
  - `JSON: JSONResolver`, `DateTime: DateTimeResolver`.
- `graphql/errors.ts`:
  - `badUserInput(issues): GraphQLError` builds the message "Invalid input: zipCode (must be 5
    digits), state (…)" and `extensions: { code: 'BAD_USER_INPUT', fields: [{ field, message
    }] }`, with one entry per field (the first issue per field).
  - `createMaskError(logger): MaskError` walks `originalError` from the received error until
    the first error that is not a `GraphQLError` (or the end of the chain):
    - If that error is a `DomainError`, it becomes `new GraphQLError(domainErr.message,
      { extensions: { code }, nodes, source, positions, path })`, with `nodes`, `source`,
      `positions` and `path` taken from the outer `GraphQLError` (as Yoga's `mask-error.js`
      does), so `locations` are kept.
    - If the chain ends in a `GraphQLError` (a resolver-thrown `BAD_USER_INPUT` arrives wrapped
      by `locatedError`), the received error is returned as it is. The wrapper already carries
      the inner `extensions`.
    - Anything else is logged (`logger.error({ err }, 'unexpected error')`) and becomes
      `"Unexpected error."` with `{ code: 'INTERNAL_SERVER_ERROR' }`. `originalError` is never
      included, whatever `isDev` is.
- `app.ts`: `AppDeps = { config, logger, repository, weather }`. It builds the service and the
  context, and sets `maskedErrors: { maskError: createMaskError(logger) }`.
- `main.ts`: `createDb(config.databaseUrl)`, the repository, and `createWeatherstackClient`.
  On shutdown it also closes the pool.

### Data flow and error model

resolver (zod args → `BAD_USER_INPUT`) → `PropertyService.create` → `WeatherClient.current`
(→ `WeatherUnavailableError`) → `PropertyRepository.insert` (a DB error → masked
`INTERNAL_SERVER_ERROR`). Nothing is written before the weather call succeeds, and the insert
is a single statement, so a failure at any step stores nothing (NFR-08).

## Phases

### Phase 1: Shared address schema

- Files:
  - `packages/shared/package.json`: adds `zod`. Contract: same range as `apps/api` (`^4.6.5`).
  - `packages/shared/src/address.ts`: the address schema and normalization. Contract:
    `addressSchema`, `AddressInput`, `Address`, `normalizeAddressText`, `normalizeAddress`.
    `state` output is `StateCode`, and `zipCode` stays a string.
  - `packages/shared/src/address.test.ts`: `it.each` tables.
  - `packages/shared/src/index.ts`: re-exports.
  - `apps/api/package.json` and `pnpm-lock.yaml`: adds `"@property-manager/shared":
    "workspace:*"` (then `pnpm install`). The API imports shared from this phase on, and pnpm's
    strict `node_modules` would fail typecheck without it.
  - `apps/api/test/fixtures/property.ts`: `PropertyInput` becomes `AddressInput` from shared.
- Proves (unit, `shared`):
  - FR-07 AC1: `8526`, `852680`, `85268-1234` and `8526A` fail on `zipCode`.
  - FR-07 AC2: `02108` is kept.
  - FR-07 AC3: `PR`, `XX` and `Arizona` fail on `state`; `dc` and `ny` give `DC` and `NY`.
  - FR-07 AC4: empty, whitespace-only and 201/101 characters fail; 200/100 pass after trimming.
  - FR-07 AC5: several invalid fields give several issues with distinct paths.
  - FR-05 AC3: normalization output, with case kept.
  - TR-07 and TR-08.
- Agent checks: `pnpm vitest run --project shared`, `pnpm typecheck`, `pnpm lint`
- Human checks: none.

### Phase 2: Domain and Weatherstack adapter

- Files:
  - `apps/api/src/domain/{property,weather,ports,errors}.ts`: the types, ports, key-field
    schema and `WeatherUnavailableError` as in *Design*. Contract: `WeatherClient.current(query)
    → WeatherReport` and `toCurrentWeather(raw) → CurrentWeather`.
  - `apps/api/src/domain/weather.test.ts`: the sample's key fields map to camelCase, `raw`
    deep-equals the sample's `current`, and removing each key field fails.
  - `apps/api/src/adapters/weatherstack/redact.ts` and `redact.test.ts`: `redactUrl` and
    `redactText`. Contract: `access_key=[REDACTED]` wherever the key appears.
  - `apps/api/src/adapters/weatherstack/response.ts` and `response.test.ts`:
    `parseWeatherstackResponse`. Contract: it returns `WeatherReport` or throws
    `WeatherUnavailableError`.
  - `apps/api/src/adapters/weatherstack/client.ts` and `client.test.ts`:
    `createWeatherstackClient`. Contract: one `GET /current` with `access_key`, `query` and
    `units=f`, and a 5 s timeout.
  - `apps/api/test/msw/weatherstack.ts`: the success handler with request recording.
  - `apps/api/test/fakes/weather.ts` and `weather.test.ts`: `FakeWeatherClient`, `calls` and
    `withBarrier(n)`.
  - `eslint.config.ts`: a `apps/api/src/domain/**` block that bans `**/graphql/**`,
    `**/services/**`, `**/repositories/**`, `**/adapters/**`, `**/db/**`, `graphql*`,
    `drizzle-orm*` and `pg`.
- Proves (unit, `api-unit` + MSW):
  - TR-03 contract: the recorded sample parses. A missing key field or non-numeric `lat` gives
    `WeatherUnavailableError`. A missing `astro` or `air_quality` still parses.
  - TR-16: mapper values.
  - TR-17 / FR-05 AC2 (adapter half): MSW sees path `/current`, the host from `baseUrl`,
    `units=f`, the exact `query`, and `access_key` equal to the sentinel. It sees exactly one
    request.
  - TR-01 (unit half): the `redactUrl` table (first, middle, last, encoded), plus a 500 response
    and a network error. The thrown error and the captured logs pass `expectNoSecret`, and the
    logged URL contains `access_key=[REDACTED]`.
  - The interim mapping: a non-2xx status, a network error, `success: false` and a schema
    failure each give `WeatherUnavailableError`. A full matrix is S-02.
- Agent checks: `pnpm vitest run --project api-unit`, `pnpm typecheck`, `pnpm lint`
- Human checks: none.

### Phase 3: Repository and service

- Files:
  - `apps/api/src/db/schema.ts`: `weatherData.$type<StoredWeather>()` from domain, replacing
    the local `WeatherSnapshot`. Contract: no schema change, and `pnpm db:generate` produces no
    new migration.
  - `apps/api/src/repositories/property.repository.ts`: `createPropertyRepository(db)`.
    Contract: `insert(NewProperty) → Property` and `findById(id) → Property | null`.
  - `apps/api/src/services/property.service.ts`: `createPropertyService({ repository, weather
    })` and `weatherQuery`. Contract: `create(Address) → Property` and `getById(id)`.
  - `apps/api/src/services/property.service.test.ts`: tests with `FakeWeatherClient` and an
    in-memory repository fake.
  - `apps/api/test/fakes/property-repository.ts`: `InMemoryPropertyRepository`, with an
    optional `failInsert(error)`.
  - `apps/api/test/integration/property-repository.int.test.ts`: tests against
    Testcontainers.
  - `apps/api/test/helpers/db.ts`: `seedProperty` uses `StoredWeather` (a type change only).
- Proves:
  - Unit (service): FR-05 AC2 (service half). There is exactly 1 weather call, with
    `weatherQuery` = `"15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States"`.
  - Unit (service): the order is weather first, then insert. A weather failure means 0 inserts.
  - Unit (service): FR-05 AC6 (service half). A failing insert propagates and the fake holds
    nothing.
  - Integration (repository): insert then `findById` round-trips every field. `createdAt` is
    set by the DB, `zipCode` `"02108"` is kept, and `findById` of an unknown UUID gives `null`.
- Agent checks: `pnpm vitest run --project api-unit`,
  `pnpm vitest run --project api-int` (Docker), `pnpm typecheck`, `pnpm lint`,
  `pnpm db:generate` (no new file)
- Human checks: none.

### Phase 4: GraphQL wiring and end-to-end create

- Files:
  - `apps/api/package.json`: adds `graphql-scalars` `^2.0.0`.
  - `apps/api/schema.graphql`: the SDL in *Design*. Contract: `createProperty(...): Property`,
    `property(id: ID!): Property`, and the `CurrentWeather` key fields plus `raw: JSON!`.
  - `codegen.ts` and `apps/api/src/graphql/generated/resolvers-types.ts`: the scalar mapping,
    regenerated. The web client output gets its own `scalars` (`JSON: 'unknown'`,
    `DateTime: 'string'`) and is regenerated, so no `any` reaches S-04.
  - `apps/api/src/graphql/errors.ts` and `errors.test.ts`: `badUserInput` and
    `createMaskError`. Contract: the codes and `fields: [{ field, message }]`.
  - `apps/api/src/graphql/resolvers.ts`: `createProperty`, `property` and the scalars.
  - `apps/api/src/graphql/context.ts`: `services.property`.
  - `apps/api/src/app.ts`: `AppDeps` adds `repository` and `weather`, and masking is wired.
  - `apps/api/src/main.ts`: the DB pool, repository and client wiring, and the pool closes on
    shutdown.
  - `apps/api/src/app.test.ts`: updated for the new `AppDeps`, using fakes.
  - `apps/api/test/helpers/app.ts`: `createTestApp({ weather?: FakeWeatherClient | 'msw',
    repository? })`, which returns `weather` as well.
  - `apps/api/test/helpers/graphql.ts`: `expectGraphQLError(result, code)`.
  - `apps/api/test/operations.ts`: the `CreateProperty` and `Property` documents.
  - `apps/api/test/integration/create-property.int.test.ts`: the AC tests.
  - `apps/api/test/integration/smoke.int.test.ts`: adapted to the new `createTestApp` (the
    health case keeps working).
  - `context/test-plan.md`: the Cookbook *(S-01)* markers are removed and the paths are set
    (`test/fakes/weather.ts`, `test/msw/weatherstack.ts`, `test/helpers/graphql.ts`). The
    mutation-target row at line 113 (Weatherstack response schema and mapper) also names
    `apps/api/src/domain/weather.ts`, where the key-field schema and `toCurrentWeather` now
    live.
- Proves (integration, `api-int`, Yoga in process on Testcontainers):
  - FR-05 AC1: the create response, compared with the sample, and `property(id)` returns the
    same data.
  - FR-05 AC2: `app.weather.calls` equals `[query]`.
  - FR-05 AC3: the stored row is normalized.
  - FR-05 AC6: with a repository whose `insert` throws an `Error` containing SQL text and a
    file path, the result is `INTERNAL_SERVER_ERROR`, the count is 0, and the response contains
    neither the SQL nor the path.
  - FR-05 AC6 (real DB rejection): a `FakeWeatherClient` whose body has `location.lat: "999"`
    passes zod (no range check) and hits the `properties_lat_range` CHECK. The result is
    `INTERNAL_SERVER_ERROR`, the count is 0, and the response contains neither
    `properties_lat_range` nor `insert into`.
  - FR-07 AC1–AC5 through the API: one `BAD_USER_INPUT` error, the expected `fields`, and 0
    weather calls. AC2 returns `"02108"`.
  - FR-10 AC2: the masked message and no `originalError`, also with `NODE_ENV=development`
    stubbed.
  - `property(id: "not-a-uuid")` gives `null`.
  - With `weather: 'msw'`: one happy create through the real client, and one 500 →
    `WEATHER_UNAVAILABLE`, count unchanged, `expectNoSecret`.
- Proves (unit, `api-unit`): the `errors.ts` table, with the cases built by `locatedError(...)`
  as graphql 17 delivers them:
  - a wrapped `GraphQLError` with `BAD_USER_INPUT` passes through with its `extensions.fields`;
  - a wrapped `DomainError` keeps its code, message, `path` and `locations`;
  - a wrapped plain `Error` is masked to "Unexpected error." / `INTERNAL_SERVER_ERROR`, has no
    `originalError`, and is logged.
- Agent checks: `pnpm codegen` (then `git status` shows only the committed outputs),
  `pnpm typecheck`, `pnpm lint`, `pnpm test` (Docker), `pnpm format:check`
- Human checks:
  - Run `pnpm dev` with a real key in `.env`, then run `createProperty` in GraphiQL
    (`:4000/graphql`) with the brief's address **once** (quota R-01). The response should have
    plausible weather, `lat` 33.609 and `long` -111.729, and `property(id)` should return it.
  - Read the `BAD_USER_INPUT` message wording for an invalid zip and state.

## Risks and unknowns

- Resolved: the JSON scalar choice (graphql-scalars, peer `^17`); non-key `current` fields stay
  optional and live only in `raw` (OQ-03); the `fields` shape; ports in `domain/`.
- Resolved: Yoga's dev-mode `originalError` leak, handled by the custom `maskError` (Finding).
- To verify in Phase 4 (not blocking): how `graphql-scalars` `DateTimeResolver` typing
  interacts with codegen's `{ input, output }` scalar config under `strictTypeChecked`. The
  fallback is `DateTime: 'Date'` for both, with the serializer accepting `Date`.
- Verified in Phase 2: MSW 3 `http.get` honours `AbortSignal.timeout` in Node 24 `fetch` (a
  handler delayed 2 s rejects with `TimeoutError` after ~200 ms at a 200 ms timeout). The
  timeout test itself is S-02 (FR-06 AC3). S-01 only sets the signal.
- Real quota: the Phase 4 human check spends one Weatherstack call. No automated test calls it
  (NFR-02; `net-guard.test.ts` keeps guarding this).
- The S-03 scope shrinks by the minimal `property(id)`. The roadmap S-01 and S-03 entries are
  updated to say so.
- Mutation targets touched (for `/mutation`): `packages/shared/src/address.ts`,
  `adapters/weatherstack/{response,redact}.ts`, `domain/weather.ts` (the mapper, TR-16),
  `services/property.service.ts` and `graphql/errors.ts`. Run at `--concurrency 4` (lessons).
- Plan review (`plan-review.md`, READY WITH NOTES): findings 1–7 are applied in this plan.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Shared address schema (3f63dd6)
- [ ] Phase 2: Domain and Weatherstack adapter
- [ ] Phase 3: Repository and service
- [ ] Phase 4: GraphQL wiring and end-to-end create

## Deviations

- Phase 1: `pnpm install` also merged duplicate peer-variant entries in `pnpm-lock.yaml`
  (`vite`, `msw`, `vitest`, `@vitest/mocker` without the `esbuild`/`tsx` peers) into the
  variant already in use. No package version changed.
- Phase 2: `test/msw/weatherstack.ts` also has `status(code, body?)` and `networkError()` next
  to `ok(body?)`, all recording requests. The plan named only the success handler, but Phase 2's
  own failure tests (500, network error) need them. S-02 adds the rest of the matrix.
- Phase 2: `response.ts` puts `currentKeyFieldsSchema` (from `domain/weather.ts`) inside the
  response schema instead of calling `toCurrentWeather`. Same schema, one parse, and the issue
  paths in the error cause read `current.<field>`.
