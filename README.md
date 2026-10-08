# Property Manager

A full-stack app for managing property records through a GraphQL API. When a property is
created, the API calls the Weatherstack `/current` endpoint once and stores the current weather
and the latitude/longitude with the record. The brief is in [`docs/brief.txt`](docs/brief.txt).

Stack: Node 24, GraphQL Yoga, Drizzle ORM on PostgreSQL 18, React 19 + Vite, Tailwind. The
choices and trade-offs are in [`context/tech-stack.md`](context/tech-stack.md).

The project was built AI-first with Claude Code. See [AI setup](#ai-setup) and
[AI sessions](#ai-sessions).

## Prerequisites

- To run the app: Docker with Docker Compose v2.
- To develop: Node 24 (version in [`.nvmrc`](.nvmrc), e.g. `nvm use`) and pnpm 12 through
  corepack (`corepack enable`; `package.json` pins the version).
- A Weatherstack API access key (<https://weatherstack.com>).

## Setup

```sh
cp .env.example .env
# edit .env and set WEATHERSTACK_KEY=<your key>
```

`WEATHERSTACK_KEY` is the only required variable. `.env` is gitignored and never enters a
Docker build context.

## Start

```sh
docker compose up
```

This starts PostgreSQL, the API (it runs the database migrations first) and the web UI.

| What                     | URL                             |
| ------------------------ | ------------------------------- |
| Web UI                   | <http://localhost:5173>         |
| GraphQL API and GraphiQL | <http://localhost:4000/graphql> |

The UI calls `/graphql` on its own origin, and nginx in the `web` container proxies it to the
API. After changing the code, rebuild with `docker compose up --build`. To stop the stack, run
`docker compose down` (add `-v` to delete the database volume).

If `WEATHERSTACK_KEY` is not set, the `api` container exits at start-up with
`Missing required environment variable: WEATHERSTACK_KEY`. The message names the variable,
never a value.

## Local development

```sh
nvm use                          # Node 24
corepack enable                  # pnpm from package.json
pnpm install                     # also enables the git hooks in .githooks/
docker compose up -d postgres    # database only
pnpm db:migrate                  # apply migrations to the dev database
pnpm dev                         # API on :4000/graphql, Vite on :5173 (proxies /graphql)
```

`pnpm dev` and the full Compose stack use the same ports (4000, 5173), so run only one of them
at a time.

- GraphQL is SDL-first. After editing `apps/api/src/graphql/schema.graphql` or a web query, run
  `pnpm codegen` and commit the output. CI fails on drift.
- After changing `apps/api/src/db/schema.ts`, run `pnpm db:generate` and commit the migration.
- `pnpm lint`, `pnpm typecheck` and `pnpm format` (or `pnpm format:check`).
- The pre-commit hook runs format check, lint, typecheck, the hermetic tests and a scan for
  secrets in the staged diff.

The API runs on Node's built-in type stripping (no build step, no tsx). Local imports end in
`.ts`, and enums and parameter properties are not allowed; tsc and ESLint enforce this. All
project commands are listed in [`CLAUDE.md`](CLAUDE.md#commands).

## Demo data

To fill an empty database with a few real properties, start the API (`docker compose up` or
`pnpm dev`) and run:

```sh
pnpm seed
```

It sends the `createProperty` mutation to the running API once per address in
[`apps/api/src/seed/addresses.ts`](apps/api/src/seed/addresses.ts), five US public landmarks
(state capitols and the Space Needle), 1.5 s apart. The brief suggests Zillow, but its listings
are mostly private homes and this repo is public, so the seed uses landmarks instead.

- **Quota.** The first run creates 5 properties and uses 5 Weatherstack calls. A re-run skips
  every address that already exists, which costs no call.
- **Errors.** Any other error stops the run with exit code 1, naming the address and the error
  code. After a 429 (`WEATHER_UNAVAILABLE`) wait a moment and run it again: it continues where it
  stopped. After `WEATHER_LOCATION_MISMATCH` or `BAD_USER_INPUT` the same address fails on every
  re-run, so change it in `addresses.ts`.
- **Never automatic.** Nothing runs the seed for you: not Compose, the Dockerfiles, CI, the git
  hooks, `pnpm dev` or the migrations. A guardrail test in `tooling/` keeps it that way.
- **Another API.** Set `SEED_API_URL` (default `http://localhost:4000/graphql`).

## Tests

| Command                                                                                     | What it runs                                                                                         | Needs                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm test:unit`                                                                            | Hermetic unit tests: shared, API, web (Testing Library + MSW), tooling                               | –                                                     |
| `pnpm test`                                                                                 | All of the above plus API integration tests against PostgreSQL (Testcontainers)                      | Docker                                                |
| `pnpm e2e`                                                                                  | Playwright smoke suite against the Compose stack                                                     | Docker; once: `pnpm exec playwright install chromium` |
| `pnpm --filter @property-manager/<api\|web\|shared> test:mutation --mutate src/<module>.ts` | StrykerJS on one module (targets in [`context/test-plan.md`](context/test-plan.md#mutation-targets)) | –                                                     |

No test calls the real Weatherstack:

- Service and resolver tests use a fake weather client.
- Adapter tests mock HTTP with MSW, and any unmocked outbound request fails the test.
- `pnpm e2e` starts its own Compose project (`property-manager-e2e`, fresh volume, UI on
  `:5180`). In that project a stub ([`e2e/stub/`](e2e/stub/README.md)) stands in for
  Weatherstack and the API gets a placeholder key. Your dev stack and data are not touched.
  Set `E2E_KEEP_STACK=1` to leave the e2e stack running for debugging.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, typecheck, format check,
the codegen drift check and `pnpm test`, then `pnpm e2e` as a separate job. It holds no real
key. The risks each test guards against are listed in
[`context/test-plan.md`](context/test-plan.md).

## Environment variables

Template: [`.env.example`](.env.example).

| Variable                | Required | Default                                                        | Purpose                                                                         |
| ----------------------- | -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `WEATHERSTACK_KEY`      | yes      | –                                                              | Weatherstack access key. Never commit or print it.                              |
| `WEATHERSTACK_BASE_URL` | no       | `https://api.weatherstack.com`                                 | Weatherstack base URL. E2E points it at the stub.                               |
| `DATABASE_URL`          | no       | `postgres://postgres:postgres@localhost:5432/property_manager` | PostgreSQL connection. Compose sets it to the `postgres` service.               |
| `PORT`                  | no       | `4000`                                                         | API HTTP port.                                                                  |
| `LOG_LEVEL`             | no       | `info`                                                         | pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `SEED_API_URL`          | no       | `http://localhost:4000/graphql`                                | GraphQL endpoint `pnpm seed` sends to. Only the seed reads it.                  |

An empty value counts as unset.

## Things to know

- **No authentication.** There are no user accounts or roles, and anyone who can reach the app
  can list, create and delete every property. The brief does not ask for auth, and a static key
  shipped in the browser bundle would only look like protection.
- **Coordinate precision is city level.** `lat` and `long` come from the location Weatherstack
  resolves the address to. Weatherstack is a weather API, not a geocoder: it ignores the street
  and resolves the town (verified 2026-10-07). The coordinates are therefore those of the city,
  not of the building, and the details page says so. The weather is as of creation time and is
  never refreshed.
- **Weatherstack quota.** Each successful create costs exactly one call. The free plan allows
  about 100 calls a month (not verified). Duplicates, invalid input, queries and deletes cost
  none. There is no retry, and the timeout is 5 s. A used-up quota (error 104) is reported as
  `WEATHER_QUOTA_EXCEEDED` with a message to upgrade the plan or replace the key. Two calls
  within about a second can return HTTP 429, which is reported as `WEATHER_UNAVAILABLE`.
  Wait a moment and try again.
- **HTTPS.** The API calls `https://api.weatherstack.com` by default, which works with the
  project's key. Some older plans reject HTTPS (Weatherstack errors 105 / 403, reported as
  `WEATHER_UNAVAILABLE`, with a configuration entry in the API log). In that case set
  `WEATHERSTACK_BASE_URL=http://api.weatherstack.com`, keeping in mind that the key, a query
  parameter, then travels unencrypted. Logged URLs and errors always show
  `access_key=[REDACTED]`.

## Decisions beyond the brief

- **Duplicate addresses are blocked (FR-08).** Two addresses that differ only in letter case or
  whitespace count as the same address. A create of an existing address fails with
  `PROPERTY_ALREADY_EXISTS`. The check runs before the Weatherstack call, so a duplicate costs
  no quota, and a unique index backs it, so two concurrent creates cannot both succeed. After a
  delete, the address can be added again. Why: duplicate records add nothing, and each one
  would spend a call from a small quota.
- **Weatherstack's region must match the submitted state (FR-05 AC4).** Weatherstack resolves
  by place name and ignores the street, so `Springfield, IL` could come back as a Springfield
  in another state. The API compares `location.region` with the full name of the submitted
  state. On a mismatch it stores nothing and returns `WEATHER_LOCATION_MISMATCH`, naming both
  states. Why: storing weather and coordinates from the wrong state would make the record
  silently wrong.
- **Only the 50 states and DC are accepted (NG-05).** The brief says every property is in the
  United States. The state is a two-letter code from a fixed table of 51, and the zip is
  exactly five digits (no ZIP+4). Territories such as PR or GU are rejected. Why: the region
  check needs a known state name for each code, and how Weatherstack reports territories is
  not verified.
- **Imperial units (D-08).** The API requests `units=f` (°F, mph, inches) and stores the unit
  system with the snapshot (`weatherData.units`). Why: the properties are in the USA, and
  storing the units keeps the numbers unambiguous if this ever changes.
- **`properties` returns all matches by default (FR-01).** The brief says "query all the
  properties". `limit` (1–100) and `offset` (≥ 0) are optional, and with no `limit` the query
  returns every match. `totalCount` is always the full count for the filter. Why: the brief's
  wording asks for everything, and paging stays available to clients that want it.

## AI setup

| Artifact                                         | What it is                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                         | Project instructions: process, rules (secrets, layers, validation, types), commands                                                                                                                                                                                                                                     |
| [`.claude/skills/`](.claude/skills/)             | The project skills: `/shape`, `/prd`, `/tech-stack`, `/roadmap`, `/test-plan`, `/plan`, `/plan-review`, `/implement`, `/mutation`, `/review`                                                                                                                                                                            |
| [`.claude/settings.json`](.claude/settings.json) | Claude Code settings and the editor hook (Prettier + ESLint on each edited file)                                                                                                                                                                                                                                        |
| [`.mcp.json`](.mcp.json)                         | MCP servers: context7 (current library docs) and Playwright. No secrets.                                                                                                                                                                                                                                                |
| [`docs/ai-workflow.md`](docs/ai-workflow.md)     | How the skills chain together, and the principles behind them                                                                                                                                                                                                                                                           |
| [`context/`](context/)                           | The artifacts the skills write: [shape notes](context/shape-notes.md), [PRD](context/prd.md), [tech stack](context/tech-stack.md), [roadmap](context/roadmap.md), [test plan](context/test-plan.md), and one folder per roadmap item under [`context/changes/`](context/changes/) (plan, plan review, mutation, review) |
| [`context/lessons.md`](context/lessons.md)       | Rules distilled from reviews and mutation runs; read before planning, implementing and reviewing                                                                                                                                                                                                                        |

## AI sessions

Every skill run is exported to [`ai-sessions/`](ai-sessions/) as
`NN-<step>-<ROADMAP-ID>[-n].txt`, where `NN` is a running number. Pre-roadmap steps have no
roadmap ID.

**Before the roadmap:**
[00-first](ai-sessions/00-first.txt),
[01-shape](ai-sessions/01-shape.txt),
[02-prd](ai-sessions/02-prd.txt),
[03-prd-zip-decision](ai-sessions/03-prd-zip-decision.txt),
[04-tech-stack](ai-sessions/04-tech-stack.txt),
[05-tech-stack-changes](ai-sessions/05-tech-stack-changes.txt),
[06-tech-stack-typescript-decision](ai-sessions/06-tech-stack-typescript-decision.txt),
[07-roadmap](ai-sessions/07-roadmap.txt),
[08-roadmap-github-issues](ai-sessions/08-roadmap-github-issues.txt),
[09-test-plan](ai-sessions/09-test-plan.txt).

**Per roadmap item** (numbers link to the exports; `–` means the step did not run):

| Item | change-id                                                                       | Plan                               | Plan review                               | Implement                                                                                                                                                                                                                                                                                                        | Mutation                                                                         | Review                               |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| F-01 | [`repo-skeleton`](context/changes/repo-skeleton/)                               | [10](ai-sessions/10-plan-F-01.txt) | – ¹                                       | [11](ai-sessions/11-implement-F-01.txt), [12](ai-sessions/12-implement-F-01-continue.txt), [13](ai-sessions/13-implement-F-01-2.txt), [14](ai-sessions/14-implement-F-01-3.txt), [15](ai-sessions/15-implement-F-01-4.txt), [16](ai-sessions/16-implement-F-01-5.txt), merge [19](ai-sessions/19-merge-F-01.txt) | [18](ai-sessions/18-mutation-F-01.txt)                                           | [17](ai-sessions/17-review-F-01.txt) |
| F-02 | [`property-schema`](context/changes/property-schema/)                           | [20](ai-sessions/20-plan-F-02.txt) | [21](ai-sessions/21-plan-review-F-02.txt) | [22](ai-sessions/22-implement-F-02-1.txt), [23](ai-sessions/23-implement-F-02-2.txt), [24](ai-sessions/24-implement-F-02-3.txt)                                                                                                                                                                                  | [25](ai-sessions/25-mutation-F-02.txt)                                           | [26](ai-sessions/26-review-F-02.txt) |
| S-01 | [`create-property-with-weather`](context/changes/create-property-with-weather/) | [27](ai-sessions/27-plan-S-01.txt) | [28](ai-sessions/28-plan-review-S-01.txt) | [29](ai-sessions/29-implement-S-01-1.txt), [30](ai-sessions/30-implement-S-01-2.txt), [31](ai-sessions/31-implement-S-01-3.txt), [32](ai-sessions/32-implement-S-01-4.txt)                                                                                                                                       | [33](ai-sessions/33-mutation-S-01.txt), [35](ai-sessions/35-mutation-S-01-2.txt) | [34](ai-sessions/34-review-S-01.txt) |
| S-02 | [`create-property-guards`](context/changes/create-property-guards/)             | [36](ai-sessions/36-plan-S-02.txt) | [37](ai-sessions/37-plan-review-S-02.txt) | [38](ai-sessions/38-implement-S-02-1.txt), [39](ai-sessions/39-implement-S-02-2.txt), [40](ai-sessions/40-implement-S-02-3.txt)                                                                                                                                                                                  | [41](ai-sessions/41-mutation-S-02.txt)                                           | [42](ai-sessions/42-review-S-02.txt) |
| S-03 | [`query-and-delete-properties`](context/changes/query-and-delete-properties/)   | [43](ai-sessions/43-plan-S-03.txt) | [44](ai-sessions/44-plan-review-S-03.txt) | [45](ai-sessions/45-implement-S-03-1.txt), [46](ai-sessions/46-implement-S-03-2.txt)                                                                                                                                                                                                                             | [47](ai-sessions/47-mutation-S-03.txt)                                           | [48](ai-sessions/48-review-S-03.txt) |
| S-04 | [`list-and-details-pages`](context/changes/list-and-details-pages/)             | [49](ai-sessions/49-plan-S-04.txt) | [50](ai-sessions/50-plan-review-S-04.txt) | [51](ai-sessions/51-implement-S-04-1.txt), [52](ai-sessions/52-implement-S-04-2.txt), [53](ai-sessions/53-implement-S-04-3.txt)                                                                                                                                                                                  | [54](ai-sessions/54-mutation-S-04.txt)                                           | [55](ai-sessions/55-review-S-04.txt) |
| S-05 | [`create-property-page`](context/changes/create-property-page/)                 | [56](ai-sessions/56-plan-S-05.txt) | [57](ai-sessions/57-plan-review-S-05.txt) | [58](ai-sessions/58-implement-S-05-1.txt), [59](ai-sessions/59-implement-S-05-2.txt)                                                                                                                                                                                                                             | [60](ai-sessions/60-mutation-S-05.txt)                                           | [61](ai-sessions/61-review-S-05.txt) |
| S-06 | [`run-and-document`](context/changes/run-and-document/)                         | [62](ai-sessions/62-plan-S-06.txt) | [63](ai-sessions/63-plan-review-S-06.txt) | [64](ai-sessions/64-implement-S-06-1.txt), [65](ai-sessions/65-implement-S-06-2.txt), [66](ai-sessions/66-implement-S-06-3.txt)                                                                                                                                                                                  | [67](ai-sessions/67-mutation-S-06.txt) ²                                         | [68](ai-sessions/68-review-S-06.txt) |
| S-07 | [`list-filters-in-url`](context/changes/list-filters-in-url/)                   | [69](ai-sessions/69-plan-S-07.txt) | [70](ai-sessions/70-plan-review-S-07.txt) | [71](ai-sessions/71-implement-S-07-1.txt), [72](ai-sessions/72-implement-S-07-2.txt)                                                                                                                                                                                                                             | [73](ai-sessions/73-mutation-S-07.txt)                                           | [74](ai-sessions/74-review-S-07.txt) |
| S-08 | [`list-pagination`](context/changes/list-pagination/)                           | [75](ai-sessions/75-plan-S-08.txt) | [76](ai-sessions/76-plan-review-S-08.txt) | [77](ai-sessions/77-implement-S-08-1.txt), [78](ai-sessions/78-implement-S-08-2.txt)                                                                                                                                                                                                                             | [79](ai-sessions/79-mutation-S-08.txt)                                           | [80](ai-sessions/80-review-S-08.txt) |
| S-09 | [`details-extra-weather`](context/changes/details-extra-weather/)               | [81](ai-sessions/81-plan-S-09.txt) | [82](ai-sessions/82-plan-review-S-09.txt) | [83](ai-sessions/83-implement-S-09.txt)                                                                                                                                                                                                                                                                          | [84](ai-sessions/84-mutation-S-09.txt)                                           | [85](ai-sessions/85-review-S-09.txt) |
| S-10 | [`demo-seed-data`](context/changes/demo-seed-data/)                             | [86](ai-sessions/86-plan-S-10.txt) | [87](ai-sessions/87-plan-review-S-10.txt) | [88](ai-sessions/88-implement-S-10.txt)                                                                                                                                                                                                                                                                          | [89](ai-sessions/89-mutation-S-10.txt)                                           | [90](ai-sessions/90-review-S-10.txt) |

¹ `/plan-review` did not exist yet.
² S-06 touches no mutation target, so the run recorded none ([`context/test-plan.md`](context/test-plan.md#mutation-targets)).
