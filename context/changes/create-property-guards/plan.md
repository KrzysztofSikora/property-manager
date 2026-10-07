# Plan: create-property-guards (S-02)

## Goal and end state

Every way a create can be refused returns a specific, safe error and saves nothing. No refusal
leaks the key. A duplicate costs no Weatherstack call, even when two creates race (issue #4).
When S-02 is done:

- FR-06 AC1: a Weatherstack quota error (body `error.code` 104, or 429; see *Decisions*)
  returns `WEATHER_QUOTA_EXCEEDED`. The message tells the operator to upgrade the plan or
  replace the API key.
- FR-06 AC2: any other `success: false` body returns `WEATHER_UNAVAILABLE`.
- FR-06 AC3: a hang is cut off by the adapter timeout (5000 ms by default; tests inject a short
  one). It returns `WEATHER_UNAVAILABLE` after exactly one HTTP request, with no retry.
- FR-06 AC4: a network error or a non-2xx status (HTTP 429 included) returns
  `WEATHER_UNAVAILABLE`.
- FR-06 AC5: a 200 body without `current`, a key field, `location.lat`/`lon`/`region`, or with
  non-numeric `lat`/`lon`, returns `WEATHER_UNAVAILABLE`. Missing non-key fields still pass.
- FR-06 AC6: body codes 101, 105 and 403 return `WEATHER_UNAVAILABLE` to the client and write
  one `error`-level log entry, "Weatherstack configuration error". Neither the entry nor the
  response contains the key.
- FR-06 AC7: for every failure above, no response or log line contains the key, and every
  logged URL shows `access_key=[REDACTED]`.
- FR-05 AC4: region `"California"` for `state: "AZ"` returns `WEATHER_LOCATION_MISMATCH`. The
  message names "AZ", "Arizona" and "California", and the count does not change.
- FR-05 AC5: every adapter failure returns its code end to end, and the count does not change.
- FR-08 AC1: a case- or whitespace-variant of a stored address returns
  `PROPERTY_ALREADY_EXISTS` with 0 weather calls, and the count does not change.
- FR-08 AC2: of two concurrent creates of a new address, exactly one is stored. The other
  returns `PROPERTY_ALREADY_EXISTS`, because the unique index enforces it.
- FR-08 AC3: once the row is deleted (directly in the test DB here; through `deleteProperty`
  in S-03), the same address can be created again.
- FR-10 AC1 holds for `WEATHER_QUOTA_EXCEEDED`, `WEATHER_UNAVAILABLE`,
  `WEATHER_LOCATION_MISMATCH` and `PROPERTY_ALREADY_EXISTS`.
- NFR-01, NFR-02 and NFR-03 are covered by the tests above. The `create-property.int.test.ts`
  test marked "interim (S-02 refines)" is replaced.

## Scope

- In:
  - Classifying Weatherstack errors in the adapter, the configuration-error log entry, an
    injectable timeout, and the full MSW failure matrix (unit and integration).
  - The region check in the service, plus `WeatherLocationMismatchError`.
  - The duplicate pre-check (`PropertyRepository.existsByAddress`), mapping `23505` on
    `properties_address_unique` to `PropertyAlreadyExistsError`, and the concurrency test.
  - PRD and test-plan edits for the decisions below (the error-case table, TR-02, TR-10).
- Out:
  - `deleteProperty`, `properties(...)` and `PROPERTY_NOT_FOUND`: S-03. FR-08 AC3 is proven
    here with a direct `DELETE` and again through the API in S-03.
  - UI messages for the new codes: S-05.
  - Retries and quota counting: never (A-08).
  - Weatherstack's geocoding accuracy (R-03, NG-04). We test only that a mismatch is reported.

## Findings

Repo state (`b9ccf66`):

- `apps/api/src/adapters/weatherstack/response.ts:22-36`: `parseWeatherstackResponse` throws
  `WeatherUnavailableError` for every `success: false` body. The cause is
  `{ weatherstackError: { code, type } }`, and `info` is never read. The schema rejection cause
  is `{ issues: [paths] }`.
- `apps/api/src/adapters/weatherstack/client.ts:15` hard-codes `TIMEOUT_MS = 5000`, so there
  is no way to inject a short timeout. `client.ts:46-50` logs every failure at `warn` with the
  redacted URL. `client.ts:81-84` re-logs the parser's rejection, again at `warn`.
- `apps/api/src/domain/errors.ts`: `DomainError` (an abstract `code`) and
  `WeatherUnavailableError`. `graphql/errors.ts:48-55` maps **any** `DomainError` to its
  `code` and `message`. New domain errors need no change in `maskError`, only test rows.
- `apps/api/src/services/property.service.ts:26-34`: `create` does weather, then insert, and
  ignores `region` (comment "checked in S-02").
- `apps/api/src/domain/ports.ts:10-13`: `PropertyRepository` has `insert` and `findById`.
- `apps/api/src/repositories/property.repository.ts:21`: "DB errors propagate unchanged;
  mapping 23505 … is S-02" (the comment says `DUPLICATE_PROPERTY`, but the FR-10 code is
  `PROPERTY_ALREADY_EXISTS`).
- `apps/api/src/db/schema.ts:38-43`: `properties_address_unique` is on `lower(street)`,
  `lower(city)`, `state`, `zip_code`. Street and city are stored already trimmed and collapsed
  (shared `addressSchema`), and state is upper-case, so an equality pre-check on the same four
  expressions matches the index exactly.
- `apps/api/test/integration/schema.int.test.ts:62-71`: Drizzle 0.45.3 throws
  `DrizzleQueryError`. The `pg.DatabaseError` (`code`, `constraint`) is on `.cause`. Confirmed
  in `drizzle-orm/errors.d.ts:9`.
- `apps/api/test/fakes/weather.ts`: `FakeWeatherClient` runs bodies through
  `parseWeatherstackResponse`, so a fake given `weatherstackError(104, …)` throws the same
  domain error the real client throws. `withBarrier(n)` already exists.
- `apps/api/test/msw/weatherstack.ts`: handlers `ok`, `status` and `networkError`. There is no
  hang handler and no non-JSON handler.
- `packages/shared/src/states.ts`: `stateName(code)`. DC is `"District of Columbia"`.
- `apps/api/test/integration/create-property.int.test.ts:261-273`: the interim
  `WEATHER_UNAVAILABLE` test, to be replaced.

Weatherstack (OQ-04, RQ-04). The live docs at `docs.apilayer.com/weatherstack` render only on
the client, so this comes from the archived `weatherstack.com/documentation` (Wayback,
2024 snapshot), section *API Error Codes*:

- The error body is `{ "success": false, "error": { "code": 104, "type":
  "usage_limit_reached", "info": "Your monthly API request volume has been reached. Please
  upgrade your plan." } }`. This is the example the docs give.
- *Common API Errors* table: 404 `404_not_found`; **101 `unauthorized`** ("did not supply an
  access key / invalid access key"); **429 `too_many_requests`** ("reached his subscription's
  monthly request allowance"); **403 `forbidden`** ("plan does not support this API function
  / HTTPS"); 601 `missing_query`; 603–614 (historical, bulk, language, unit, interval and
  forecast options); **615 `request_failed`**.
- **105 `https_access_restricted` is not in the current table.** It appears in older
  apilayer docs, so it is kept as a legacy code. HTTPS is "Available on: Standard Plan and
  higher". The project key works with HTTPS (PRD, 2026-10-07).
- The `type` for 101 is documented as `unauthorized`. The PRD's `missing_access_key` /
  `invalid_access_key` come from older docs. Classification uses only `code`, never `type`.
- HTTP **status** 429 on calls in quick succession was seen on 2026-10-07 (PRD). Its body is
  unknown. That is a burst limit, not the monthly quota.
- `info` is free text from Weatherstack. It is never logged or returned, which keeps the
  current behaviour.
- No real call is made for the error codes: 104/429 cannot be triggered safely, and the docs
  are enough. One real call is planned for DC (see *Decisions*).

Library facts:

- MSW 3.0.2: `delay('infinite')` (modes `'real' | 'infinite'`, `msw/src/utils/delay.ts:20`) is
  exported from the `msw` root entry (`lib/core/index.d.ts:15`). `http` and `HttpResponse` are
  imported from `msw/http`, as now.
- `AbortSignal.timeout(ms)` rejects `fetch` with a `TimeoutError` `DOMException` (S-01
  finding). The existing `summarize` already logs its name.

## Decisions

| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| Which body codes mean the quota is used up | `104` and `429` → `WEATHER_QUOTA_EXCEEDED`. HTTP **status** 429 stays `WEATHER_UNAVAILABLE`. | The docs describe body 429 as the monthly allowance, and the operator needs the actionable message. The status 429 is a burst limit, where trying again helps. PRD FR-06 AC1 and the error-case table are updated. | user |
| Which codes write the configuration-error log | `101`, `105` and `403`, all `WEATHER_UNAVAILABLE` to the client | 403 is the documented HTTPS/plan code; 105 is kept for older accounts. The PRD table is updated. | user |
| DC region string (R-03) | One real call with a DC address after Phase 2 lands (a human check, at least 1 s after any other call), made as a `createProperty` through `pnpm dev`, not a hand-built `/current` request. A success proves the region matches; a `WEATHER_LOCATION_MISMATCH` message shows the region Weatherstack returned. The result is recorded in *Deviations* / PRD *Verified so far*. If it is not "District of Columbia", an alias is added and tested. | A verified value costs one quota call. A guessed alias list could still miss. Going through the mutation keeps the key out of any URL or shell command and keeps the only real call in the create mutation (CLAUDE.md). | user (method: plan-review #4) |
| Phase split | 3 phases: classification, region, duplicates | One reviewable diff per guard. | user |
| Where the region check lives | `regionMatchesState(region, state)` exported from `services/property.service.ts`. It compares the trimmed, lower-cased `region` with `stateName(state)`, lower-cased. | The test-plan names it as a service mutation target (TR-09). It is business logic, not adapter logic. | research (test-plan) |
| Mismatch error contract | `WeatherLocationMismatchError(state, region)`. The message is `Weatherstack placed this address in "<region>", not in <code> (<name>). The property was not saved.` and `extensions` is `{ code }` only. | FR-10 only requires the message to name both. Extra extension fields would be an untested contract with no consumer yet. | research (PRD) |
| How `region` is shown in the message | Trimmed and cut to 100 characters | It is third-party text echoed to the client, and the length bound keeps a weird response from bloating the error. It never holds the key, because it comes from the response body, not the URL. | research |
| Where the timeout is set | A client option `timeoutMs`, default `5000`. No env variable. | TR-10 needs a short injected timeout. An env variable would be a config surface nobody asked for. Test-plan TR-10 wording ("from config") is updated to "client default". | research |
| How config failures are signalled to the client logger | `WeatherUnavailableError` gets a `reason: 'configuration' \| 'upstream'` field (default `'upstream'`). The client logs `reason: 'configuration'` at `error` with "Weatherstack configuration error", and the rest at `warn` as now. | One error class keeps FR-10's single code. The reason is an assertable field (lesson: assert cause/code, not only type). | research + lesson |
| Order of steps | Duplicate pre-check, weather, region check, insert | Given by PRD FR-05. Validation stays in the resolver. | research (PRD) |
| Pre-check query | `existsByAddress(address)`: `select 1 … where lower(street) = lower($1) and lower(city) = lower($2) and state = $3 and zip_code = $4 limit 1` | The same expressions as the unique index, so the pre-check and storage agree (TR-07). | research |
| Race enforcement | `insert` catches an error whose `cause` (or the error itself) is a `pg.DatabaseError` with `code === '23505'` and `constraint === 'properties_address_unique'`, and throws `PropertyAlreadyExistsError`. Any other DB error propagates unchanged and is masked as `INTERNAL_SERVER_ERROR`. | FR-08 AC2 says storage enforces it. Checking the constraint name keeps a future unique index from being misreported. | research (F-02 finding) |
| FR-08 AC3 before `deleteProperty` exists | The integration test deletes the row with Drizzle (`db.delete(properties)`) and then creates it again through the API | The roadmap says "through a repository-level delete here". Adding a repository `delete` now would pre-empt the S-03 design. The test still proves that the index does not block a re-create. | research (roadmap) |

## Design

### Error model (`apps/api/src/domain/errors.ts`)

| Class | `code` | Message (FR-10) | Extra fields |
|-------|--------|-----------------|--------------|
| `WeatherUnavailableError` (exists) | `WEATHER_UNAVAILABLE` | unchanged | `reason: 'configuration' \| 'upstream'`, a constructor option, default `'upstream'` |
| `WeatherQuotaExceededError` (new) | `WEATHER_QUOTA_EXCEEDED` | "The Weatherstack usage limit has been reached, so the property was not saved. Upgrade the Weatherstack plan or replace the API key." | — |
| `WeatherLocationMismatchError` (new) | `WEATHER_LOCATION_MISMATCH` | see *Decisions* | `state: StateCode`, `region: string` |
| `PropertyAlreadyExistsError` (new) | `PROPERTY_ALREADY_EXISTS` | "A property with this address already exists." | — |

All of them use explicit fields with no parameter properties (type stripping), and each takes
`ErrorOptions` for `cause`. `maskError` needs no change, because it maps any `DomainError`.

### Adapter

- `response.ts`:
  - `classifyWeatherstackError(code: number | undefined): 'quota' | 'configuration' |
    'upstream'`, exported and table-tested. `104`, `429` → quota; `101`, `105`, `403` →
    configuration; anything else, `undefined` included → upstream.
  - `parseWeatherstackResponse` throws `WeatherQuotaExceededError` for quota, and
    `WeatherUnavailableError({ reason })` otherwise. The cause stays `{ weatherstackError: {
    code, type } }`, never `info`.
- `client.ts`:
  - The `timeoutMs?: number` option replaces `TIMEOUT_MS` (default 5000, exported as
    `DEFAULT_TIMEOUT_MS`).
  - A parser rejection is logged once with the redacted URL and the cause:
    - `WeatherQuotaExceededError` at `error`, "Weatherstack usage limit reached";
    - `reason: 'configuration'` at `error`, "Weatherstack configuration error";
    - everything else at `warn`, as now.
  - The other paths (network, timeout, non-2xx, invalid JSON) are unchanged apart from the
    timeout.
- `test/msw/weatherstack.ts`: adds `hang()` (records, then `await delay('infinite')`) and
  `text(body)` (a non-JSON 200).

### Service (`services/property.service.ts`)

```
create(address):
  if (await repository.existsByAddress(address)) throw new PropertyAlreadyExistsError()
  report = await weather.current(weatherQuery(address))
  if (!regionMatchesState(report.region, address.state))
    throw new WeatherLocationMismatchError(address.state, report.region)
  return repository.insert(...)          // may throw PropertyAlreadyExistsError (race)
```

`regionMatchesState(region: string, state: StateCode): boolean` is exported.

### Repository

- `ports.ts`: `PropertyRepository.existsByAddress(address: Address): Promise<boolean>`.
- `property.repository.ts`: `existsByAddress` as in *Decisions*. `insert` wraps the insert
  and maps the unique violation through a small `isAddressUniqueViolation(error: unknown)`
  type guard over `error` and `error.cause` (`pg.DatabaseError`).
- `test/fakes/property-repository.ts`: `existsByAddress` uses the same normalization rule
  (lower-cased street and city, state, zip). `insert` is unchanged: a sequential test cannot
  reach it with a stored key after a clean pre-check, so the service unit test for the race
  branch uses the existing `failInsert(new PropertyAlreadyExistsError())`.

### Data flow

resolver (zod → `BAD_USER_INPUT`) → service: `existsByAddress` (→ `PROPERTY_ALREADY_EXISTS`,
0 weather calls) → `WeatherClient.current` (→ `WEATHER_QUOTA_EXCEEDED` /
`WEATHER_UNAVAILABLE`) → `regionMatchesState` (→ `WEATHER_LOCATION_MISMATCH`) →
`insert` (→ `PROPERTY_ALREADY_EXISTS` on `23505`, otherwise a masked
`INTERNAL_SERVER_ERROR`). Nothing is written before the last step, and the insert is a single
statement (NFR-08).

## Phases

### Phase 1: Weather failure classification

- Files:
  - `apps/api/src/domain/errors.ts`: adds `WeatherQuotaExceededError` and the `reason` on
    `WeatherUnavailableError`. Contract: the codes and messages in *Design*.
  - `apps/api/src/adapters/weatherstack/response.ts` and `response.test.ts`:
    `classifyWeatherstackError` and the typed throws. Contract: `parseWeatherstackResponse`
    throws `WeatherQuotaExceededError` or `WeatherUnavailableError` with `reason`.
  - `apps/api/src/adapters/weatherstack/client.ts` and `client.test.ts`: the `timeoutMs`
    option, and logging levels and messages per class. Contract: `WeatherstackClientOptions`
    gains `timeoutMs?`, and `DEFAULT_TIMEOUT_MS = 5000`.
  - `apps/api/test/msw/weatherstack.ts`: `hang()` and `text()`.
  - `apps/api/src/graphql/errors.test.ts`: rows for `WeatherQuotaExceededError` (and, in
    later phases, the other new classes) → the code and message.
  - `apps/api/test/integration/create-property.int.test.ts`: replaces the interim test with an
    `it.each` over the MSW app (`createTestApp({ weather: 'msw' })`). Rows: 104, body 429,
    101, 105, 403, 615, an unknown code, `success: false` without `error`, status 500, 503,
    status 429, a network error, a non-JSON 200, a missing key field. Each row asserts the
    code, an unchanged count, one request, and `expectNoSecret(result, app.logs())`. Every
    logged URL contains `access_key=[REDACTED]`.
  - `context/prd.md`: the error-case table and FR-06 AC1/AC6 wording (body 429 → quota, 403
    → config log), with the docs source in *Verified so far*.
  - `context/test-plan.md`: TR-02 rows (429, 403), TR-10 ("client default 5000 ms"), and the
    TR-01/02/10/11 status.
- Proves:
  - Unit (`api-unit`, MSW):
    - FR-06 AC1 and AC2: the TR-02 table. For each code, assert the class and `code`, plus
      `reason` and `cause.weatherstackError.code` (lesson: not only the type).
    - FR-06 AC3 / TR-10: `hang()` with `timeoutMs: 50` rejects with `WeatherUnavailableError`
      after exactly one request, and the logged error name is `TimeoutError`. A spy on
      `AbortSignal.timeout` is called with `5000` when no `timeoutMs` is passed and with `50`
      when `timeoutMs: 50` is passed, which proves the default is wired, not only declared.
    - FR-06 AC4 / TR-11: network error, 500, 503, status 429 and non-JSON each reject with
      `WeatherUnavailableError` and one request.
    - FR-06 AC5 / TR-03: the existing schema cases, now also asserting `reason: 'upstream'`.
    - FR-06 AC6: 101, 105 and 403 each write exactly one `error`-level "Weatherstack
      configuration error" line with `url` containing `access_key=[REDACTED]`. A 615 writes
      none.
    - FR-06 AC7 / TR-01: an error body whose `info` contains the sentinel key, and a stubbed
      `fetch` rejecting with a `TypeError` whose message quotes the full URL with the key.
      Lesson 3: the key sits in the part the code must drop, next to text it keeps. Neither
      the thrown error nor the logs contain the sentinel.
  - Integration (`api-int`): FR-05 AC5, plus FR-10 AC1 for `WEATHER_QUOTA_EXCEEDED` and
    `WEATHER_UNAVAILABLE` (the MSW table above), and FR-06 AC6 end to end (101 → one config
    log line with the request's `requestId`, and no key).
- Agent checks: `pnpm vitest run --project api-unit`, `pnpm vitest run --project api-int`
  (Docker), `pnpm typecheck`, `pnpm lint`
- Human checks: the PRD/test-plan wording for body 429 and 403 reads correctly.

### Phase 2: Region check

- Files:
  - `apps/api/src/domain/errors.ts`: `WeatherLocationMismatchError`. Contract: the message
    names the code, the state name and the returned region (trimmed, at most 100 characters).
  - `apps/api/src/services/property.service.ts`: `regionMatchesState`, called after the
    weather call and before `insert`. Contract: `regionMatchesState(region: string, state:
    StateCode): boolean`.
  - `apps/api/src/services/property.service.test.ts`: the TR-09 table, plus the service
    order.
  - `apps/api/src/graphql/errors.test.ts`: the mismatch row.
  - `apps/api/test/integration/create-property.int.test.ts`: the FR-05 AC4 test, and the
    existing FR-07 AC2 test (`state: 'MA'`, lines 136-147) gets
    `new FakeWeatherClient(weatherstackResponse({ location: { region: 'Massachusetts' } }))`.
    The default fake returns `"Arizona"`, so without this the test fails with
    `WEATHER_LOCATION_MISMATCH`. Before committing, grep the tests for any other non-AZ create
    that goes through the service (at `b9ccf66` this is the only one).
  - `context/prd.md`: *Verified so far* gets the DC result.
- Proves:
  - Unit (TR-09): `regionMatchesState` true for `"Arizona"`, `"arizona"`, `" Arizona "`
    with `AZ`, and for `"District of Columbia"` (or the verified string) with `DC`. False for
    `"California"` with `AZ`, `""`, `"Arizona Territory"`, and `"Virginia"` with `WV`
    (prefix/substring guard).
  - Unit (service): on a mismatch, 1 weather call, 0 inserts, and the error has `state`,
    `region` and `code`.
  - Integration: FR-05 AC4 with `FakeWeatherClient(weatherstackResponse({ location: { region:
    'California' } }))`. Asserts `WEATHER_LOCATION_MISMATCH`, a message containing "AZ",
    "Arizona" and "California", count 0, and 1 weather call.
- Agent checks: `pnpm vitest run --project api-unit`, `pnpm vitest run --project api-int`,
  `pnpm typecheck`, `pnpm lint`
- Human checks: after the phase lands, with `pnpm dev` running, one `createProperty` for a DC
  address (e.g. `1600 Pennsylvania Ave NW`, `Washington`, `DC`, `20500`), at least 1 s after
  any other call. A success proves "District of Columbia" matches. A
  `WEATHER_LOCATION_MISMATCH` message shows the region Weatherstack returned: record it and add
  the alias. Nobody types the key into a URL or shell command. Read the mismatch message
  wording.

### Phase 3: Duplicate prevention

- Files:
  - `apps/api/src/domain/errors.ts`: `PropertyAlreadyExistsError`.
  - `apps/api/src/domain/ports.ts`: `existsByAddress`. Contract:
    `existsByAddress(address: Address): Promise<boolean>`.
  - `apps/api/src/repositories/property.repository.ts`: `existsByAddress`, the `23505`
    mapping on `properties_address_unique`, and the fixed comment. Contract: `insert` throws
    `PropertyAlreadyExistsError` only for that constraint.
  - `apps/api/src/services/property.service.ts`: the pre-check before the weather call.
  - `apps/api/src/services/property.service.test.ts`: pre-check and race-branch tests.
  - `apps/api/test/fakes/property-repository.ts`: `existsByAddress` only.
  - `apps/api/src/graphql/errors.test.ts`: the duplicate row.
  - `apps/api/test/integration/property-repository.int.test.ts`: `existsByAddress` true/false
    (case and spacing variants already normalized), a second `insert` of the same address
    throwing `PropertyAlreadyExistsError` with `cause` code `23505`, and a different
    constraint violation (lat out of range) propagating unchanged.
  - `apps/api/test/integration/create-property.int.test.ts`: FR-08 AC1–AC3.
  - `context/test-plan.md`: TR-04 to TR-07 and TR-09 status, set to `covered` where S-02
    owns them.
- Proves:
  - Unit (service): a pre-check hit means 0 weather calls and 0 inserts, and the error's
    `code` is `PROPERTY_ALREADY_EXISTS`. A duplicate on `insert` after a clean pre-check
    (`repository.failInsert(new PropertyAlreadyExistsError())`) propagates
    `PropertyAlreadyExistsError`.
  - Integration:
    - FR-08 AC1: `seedProperty`, then a create with `street: "15528 e golden eagle  blvd",
      city: "FOUNTAIN HILLS"` → `PROPERTY_ALREADY_EXISTS`, 0 weather calls, count 1.
    - FR-08 AC2 / TR-06: `FakeWeatherClient.withBarrier(2)` and `Promise.all` of two creates.
      Exactly one success and one `PROPERTY_ALREADY_EXISTS` (in either order), count 1, and 2
      weather calls (both passed the pre-check, which proves the index did the work).
    - FR-08 AC3: create, `db.delete(properties)` for that id, then create again → success,
      count 1.
- Agent checks: `pnpm vitest run --project api-unit`, `pnpm vitest run --project api-int`,
  `pnpm typecheck`, `pnpm lint`; then `/mutation create-property-guards` on `response.ts`,
  `client.ts` and `property.service.ts` (`--concurrency 4`, lesson 1). `graphql/errors.ts` is
  left out: `maskError` does not change, and the test-plan targets only modules the change
  touches.
- Human checks: none.

## Risks and unknowns

- **The body for HTTP 429 is unknown** (resolved by design): every non-2xx status maps to
  `WEATHER_UNAVAILABLE` before the body is read, so its shape does not matter.
- **The body codes come from archived docs, not live calls** (accepted, RQ-04): 104/429 are
  never triggered for real. If Weatherstack sends a different code for an exhausted quota, the
  user sees `WEATHER_UNAVAILABLE` and the warn log shows the code. It is a one-line table
  change.
- **The DC region string** (R-03): resolved by the Phase 2 human check (a `createProperty`
  through `pnpm dev`). Until then, the unit table row uses "District of Columbia".
- **Concurrency test flakiness** (TR-06): the barrier holds both calls after the pre-check, so
  both always reach `insert`. Determinism does not depend on timing. `fileParallelism: false`
  keeps truncation from racing.
- **A pg error not on `cause`** (resolved): the type guard checks both the error and
  `error.cause`, so a Drizzle upgrade that stops wrapping still maps.
- **Codegen**: no SDL change, so `pnpm codegen` produces no diff.

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Weather failure classification (d64251f)
- [x] Phase 2: Region check (31cb664)
- [x] Phase 3: Duplicate prevention (74a61cb)

## Deviations

- Phase 1: the `test-plan.md` Cookbook (step 6) also lists the new `hang` and `text` handlers.
  The standalone non-JSON client test moved into the TR-01/TR-11 `it.each` (as a `text()` row),
  and the old 615 row moved to the new body-code table, so each case is asserted once.
