# Shape notes: Property Manager

## Brief summary
A full-stack TypeScript app (Node.js backend, React frontend) for managing property records
through a GraphQL API. Users can list properties, sort them by creation date, filter them by
city, zip code and state, view any property's details, add properties (all within the United
States) and delete them. When a property is created, the create mutation calls the Weatherstack
`/current` endpoint once and stores the `current` weather object together with the latitude and
longitude from the response. The work is assessed on code quality, technology choices, scope
completion and the quality of the AI harness. It is delivered as a public repo that includes the
AI sessions and a README with run instructions.

## Constraints (mandated by the brief)
- C-01 Backend TypeScript/Node.js; frontend React/TypeScript.
- C-02 The API is GraphQL.
- C-03 Weatherstack `https://api.weatherstack.com/current` is called "only during creation of the
  property (as part of the GraphQL Mutation)".
- C-04 `id` is generated on the backend/database side; the format is our choice.
- C-05 `city`, `street`, `state` (abbreviation), `zipCode` (5 digits) are mutation arguments;
  `weatherData`, `lat`, `long` come from the Weatherstack response.
- C-06 The repo includes a README with run instructions and the full AI setup and sessions.
- C-07 Database is our choice.

## Decisions
| ID | Topic | Decision | Reason | Source |
|----|-------|----------|--------|--------|
| D-01 | Weatherstack failure on create | The mutation fails and nothing is saved. `weatherData`, `lat`, `long` are always present (non-null) on a stored property. | No other call is allowed later, so a property saved without weather could never get it. | user |
| D-02 | Usage limit reached | Return a dedicated, clearly worded GraphQL error (e.g. `WEATHER_QUOTA_EXCEEDED`) that tells the operator to upgrade the plan or replace the API key. Other failures (timeout, network, invalid response, other API errors) return a generic `WEATHER_UNAVAILABLE`-type error. | The free plan quota is small, and when it runs out the operator has a clear fix. | user |
| D-03 | Weatherstack query | `query` = the 5-digit `zipCode`. | A US ZIP is unambiguous. Weatherstack does not geocode streets, so a full address would not improve accuracy. | user |
| D-04 | Location check | Reject the creation if `location.region` in the response does not match the submitted `state`. Nothing is saved. | Stops weather from another place being stored silently. | user |
| D-05 | lat/long precision | `lat`/`long` are the coordinates Weatherstack returns for the ZIP area, not the building. The README states this. | It is a limit of the API, so we document it. | user (follows D-03) |
| D-06 | Filtering | All filters are optional and combined with AND. `city`: case-insensitive partial match (contains). `state`: exact match, normalized to upper case. `zipCode`: exact match. | Convenient in the UI and predictable for codes. | user |
| D-07 | Duplicates | Reject a property whose normalized address (street + city + state + zip, trimmed, whitespace collapsed, case-insensitive) already exists. The check runs before the Weatherstack call and is backed by a unique constraint in the DB. Error e.g. `PROPERTY_ALREADY_EXISTS`. | Avoids duplicate records and saves API quota. | user |
| D-08 | Weather units | Request imperial units (`units=f`: °F, mph, in). Store the unit system with the data. | The properties are in the USA. | user |
| D-09 | weatherData shape | Store the whole `current` object as received. Expose it in GraphQL as a typed `WeatherData` object (fields from `current`) plus `units`, not as an untyped JSON scalar. | Matches the brief ("object containing current property") and gives clients a typed contract. | user |
| D-10 | Pagination | The `properties` query takes optional `limit`/`offset` (default 20, max 100) and returns `{ items, totalCount }`. | A standard list API that still lets the client go through all records. | user |
| D-11 | Sorting | Sort by creation date, ascending or descending, chosen by the user. | US-2. | brief + user |
| D-12 | Frontend screens | Three routes: list (`/`) with filters, sort, pagination and delete with confirmation; details (`/properties/:id`) with address, lat/long and weather; create form (`/properties/new`) with client-side validation and readable API errors (quota, duplicate, state mismatch). Each view has loading, empty and error states. | Covers every user story and gives shareable links to details. | user |
| D-13 | Authentication | None. All users have full access. The README says so. | The brief does not mention it. A static key that ships in the browser bundle would only look like protection. | user |
| D-14 | Running | One command for reviewers, `docker compose up` (DB + API + frontend), plus a local npm workflow for development. Both are described in the README. The reviewer only adds their own `WEATHERSTACK_KEY` to `.env`. | Easy to evaluate, convenient to develop. | user |

## Assumptions
- A-01 `state` must be one of the 50 US state codes or DC. Input is trimmed and upper-cased.
  Territories (PR, GU, …) are rejected.
- A-02 `zipCode` is exactly 5 digits (ZIP+4 is rejected) and is stored as a string, so leading
  zeros are kept.
- A-03 `street` and `city` are required, trimmed, non-empty and have a sensible max length
  (e.g. 200 / 100 characters).
- A-04 Properties are immutable after creation. There is no update story, so there is no update
  mutation.
- A-05 Delete is a hard delete. Deleting a non-existent id returns a not-found error.
- A-06 Querying a non-existent id returns `null` (GraphQL convention), and the UI shows a
  "not found" state.
- A-07 Default sort is newest first (`createdAt` descending). `createdAt` is set by the backend
  and exposed in GraphQL.
- A-08 The Weatherstack call has a timeout (around 5 s) and no automatic retries, so it does not
  burn quota.
- A-09 An invalid or missing Weatherstack key is a configuration error. It is logged with the key
  redacted and reported to the client as the generic weather error, never with the key.
- A-10 Weatherstack can return HTTP 200 with `{ "success": false, "error": {...} }`. That counts
  as a failure and is mapped by its error code (D-02).
- A-11 `WEATHERSTACK_BASE_URL` stays configurable, so the scheme/host can change without a code
  change (see R-02).
- A-12 Region matching (D-04) compares the response's full state name with the name that the
  submitted state code maps to.

## Non-goals
- NG-01 Authentication, authorization and user accounts (D-13).
- NG-02 Editing properties.
- NG-03 Refreshing or re-fetching weather after creation (forbidden by C-03).
- NG-04 Street-level geocoding or address verification beyond the ZIP/state check.
- NG-05 Addresses outside the 50 states + DC.
- NG-06 Soft delete, audit history, undo.
- NG-07 Public deployment or hosting. The app runs locally.

## Deferred questions
- Q-01 Database, GraphQL server/client libraries and ORM. Decided in `/tech-stack`.
- Q-02 Which `current` fields are shown in the details view, and how. Decided in `/prd` or the
  UI plan. Any choice is valid because the full object is stored (D-09).
- Q-03 Exact GraphQL error codes and message wording. Decided in `/prd`.
- Q-04 Seed data for demos (a few real addresses, e.g. from Zillow). Nice to have and does not
  change requirements. Seeding must not call Weatherstack unless it goes through the mutation.
- Q-05 Logging and observability depth (structured logs, request ids). Decided in
  `/tech-stack` / `/test-plan`.
- Q-06 CI pipeline (GitHub Actions running lint, typecheck and tests). Decided in `/roadmap`.

## Risks spotted
- R-01 **Quota exhaustion** (high / medium). The free plan allows about 100 calls a month, and
  manual testing can use them up. Mitigation: duplicate check before the call (D-07), a clear
  quota error (D-02), fake adapter in all automated tests. We will see it early through the
  quota error in manual runs.
- R-02 **HTTPS on the free plan** (medium / high). Weatherstack's free tier has historically
  rejected HTTPS (error `https_access_restricted`), but the brief gives an `https://` URL. We will
  find out with one manual call during the adapter change. The base URL is in env (A-11), and any
  switch to HTTP is documented.
- R-03 **ZIP/region mismatch false negatives** (low / medium). Weatherstack may resolve a valid
  ZIP to a neighbouring state or a differently named region, so a correct address gets rejected.
  We will see it during manual tests with Zillow addresses near state borders. The error message
  names both states, so the cause is visible.
- R-04 **Response shape drift** (low / medium). Weatherstack fields can change or be missing on
  some plans (e.g. `air_quality`, `astro`). The response is zod-validated at the adapter, and
  optional fields are optional in `WeatherData`. A contract test runs against a recorded sample
  (`docs/samples/weatherstack-current.json`).
- R-05 **Secret leakage** (low / high). `access_key` is a query parameter, so it can end up in
  logged URLs and HTTP error messages. Mitigation: redaction rule in CLAUDE.md, tested redaction
  helper, secret scan before each push. The repo becomes public at hand-in.
- R-06 **Scope creep vs. assessment time** (medium / medium). Pagination, the duplicate check and
  the region check add work beyond the brief. Mitigation: `/roadmap` orders them after the core
  user stories.
