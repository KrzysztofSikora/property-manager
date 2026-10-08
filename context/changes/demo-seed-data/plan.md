# Plan: demo-seed-data (S-10)

## Goal and end state
A reviewer can fill an empty database with a few real US properties with one documented
command (FR-16 AC1, Could, Q-04, B-N7):

- `pnpm seed` sends the `createProperty` mutation to a running API, once per address in a
  short, checked-in list of real US addresses (public landmarks, see *Seed addresses*). Weather, `lat` and `long` are therefore
  real and each new property uses one Weatherstack call.
- An address that already exists (`PROPERTY_ALREADY_EXISTS`) is skipped, so a re-run is safe
  and costs no quota. Any other error stops the run with exit code 1 and a message naming the
  address and the error code.
- Nothing runs the seed automatically: not Compose, the Dockerfiles, CI, git hooks, `dev`,
  `start`, migrations or any install lifecycle script. A guardrail test proves this.
- The README documents the command, its precondition (API running) and its quota cost.

Closes #13.

## Scope
- In:
  - A seed CLI in `apps/api/src/seed/` that talks to the API over HTTP, with root and api
    `seed` scripts.
  - `SEED_API_URL` (optional, default `http://localhost:4000/graphql`) in the env config.
  - Unit tests (MSW at the GraphQL URL), one Testcontainers test through the real app with the
    fake weather client, and a tooling guardrail for "never automatic".
  - README "Demo data" section, `.env.example`, test-plan row TR-29 and a mutation-target row.
- Out:
  - Seeding directly through the repository or SQL (PRD: Weatherstack is reached only through
    the mutation; the AC requires the mutation).
  - Deleting or resetting existing data before seeding.
  - Running the seed inside Compose or the e2e stack. The e2e stack has its own stub data.
  - Retries on `WEATHER_UNAVAILABLE` / HTTP 429 (the user re-runs; duplicates are skipped).
  - A real Weatherstack call in any test (NFR-02, TR-25).

## Findings
- `createProperty(street, city, state, zipCode): Property` (`apps/api/schema.graphql:140`).
  Error codes come from `ERROR_CODES` in `packages/shared/src/errors.ts:2-10`; the duplicate
  code is `PROPERTY_ALREADY_EXISTS`, not "DUPLICATE_ADDRESS".
- The duplicate check runs before the Weatherstack call (D-07, PRD *External integrations*),
  so a skipped duplicate costs no quota.
- README *Things to know* (`README.md:123-129`): two calls within about a second can return HTTP
  429 (`WEATHER_UNAVAILABLE`). The seed must space its creates.
- CLI pattern to follow: `apps/api/src/db/migrate-cli.ts` exports
  `runMigrateCli(env, stderr): Promise<0 | 1>` and runs it under `if (import.meta.main)`; its
  config comes from `loadDatabaseConfig` in `config/env.ts`, which parses only what the command
  needs (no Weatherstack key). `pnpm db:migrate` runs it with
  `node --env-file-if-exists=../../.env` (`apps/api/package.json`).
- `config/env.ts`: `parseEnv` iterates every name in `REASONS` but each schema is a `z.object`
  that strips unknown keys, so adding `SEED_API_URL` to `REASONS` does not affect
  `loadConfig` / `loadDatabaseConfig`. Messages name the variable, never its value.
- ESLint layer rules cover only `graphql/`, `services/`, `repositories/`, `adapters/`,
  `domain/` (`eslint.config.ts:49-105`). A new `src/seed/` folder is a client of the API, not a
  layer: it must import none of them (it uses `config/env.ts` and `@property-manager/shared`
  only). Nothing enforces that today, so this change adds a `restrictImports` block for
  `src/seed/`. `apps/api/tsconfig.json` includes `src` and `test`, so typecheck and lint pick it
  up.
- MSW is set up once for `api-unit` with no default handlers and `onUnhandledFrame: 'error'`
  (`apps/api/test/setup/msw.ts`), so each seed unit test mocks the GraphQL URL itself.
- `createTestApp` (`apps/api/test/helpers/app.ts:39-89`) wraps the real composition root and
  sends requests with `yoga.fetch`, but exposes only `execute`. The int test needs the raw
  `fetch` to hand to the seed.
- Places that could run a command automatically: `docker-compose.yml`,
  `docker-compose.e2e.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
  `.github/workflows/ci.yml`, `.githooks/pre-commit`, the `scripts` of the root and
  workspace `package.json` files, the e2e setup that already runs shell commands before
  Playwright (`e2e/*.ts`, notably `global-setup.ts` and `compose.ts`), and the Claude Code hooks
  (`.claude/settings.json`, whose only hook runs `tooling/claude-format-hook.sh`). None mentions a
  seed today.
- Earlier mutation records have no `strengthen` rows on modules this change edits except
  `config/env.ts` (`changes/repo-skeleton/mutation.md`). Adding a variable does not move any
  existing input, but `/mutation` re-checks those rows (lessons.md, "moves a rule's input").

## Decisions
| Question | Answer | Why | Decided by |
|----------|--------|-----|------------|
| How does the seed reach the mutation? | HTTP POST to a running API (`SEED_API_URL`, default `http://localhost:4000/graphql`) | Goes through the real mutation path, works with `pnpm dev` and `docker compose up`, needs no key or DB access in the seed. Costs: the API must be running. | user |
| Behaviour on failure | `PROPERTY_ALREADY_EXISTS` → skip and continue. Any other GraphQL error, non-2xx HTTP, unreachable API or malformed response → stop, exit 1 | Re-runs are safe and free. A key or quota error would repeat for every address, so stop at the first. | user |
| Where do the addresses come from? | Five public landmarks (state capitols and the Space Needle), one per state, each in a city far from any state border (R-03); street addresses checked against official or well-known listings (see *Seed addresses*) | Brief tip (B-N7) points at Zillow, but Zillow listings are mostly private homes and the repo is public; landmarks are real, stable, well-geocoded addresses with no privacy cost. | user (list found by Claude, web search 2026-10-08) |
| Phases | One phase, one commit (`Closes #13`) | Small item. | user |
| Spacing between creates | Wait 1.5 s after each successful create, except the last. Not after a skipped duplicate (no Weatherstack call); any other error ends the run anyway. `sleep` is injected so tests do not wait. | README: two calls within about a second can return 429. | research (README) |
| Order and concurrency | Sequential, in list order | Spacing and stop-on-first-error need it; 5 addresses take seconds. | planner default |
| Response validation | zod schema for the GraphQL response: `data.createProperty { id, street, city, state, zipCode }`, or `errors[]` with `message: string` and an optional `extensions.code: string` (any string, not only `ERROR_CODES`). Only `PROPERTY_ALREADY_EXISTS` means `exists`; any other code, or an error without one, is `failed` with its code and message | CLAUDE.md: validate external responses at the boundary. Yoga's own errors (`GRAPHQL_VALIDATION_FAILED`, `GRAPHQL_PARSE_FAILED`) are outside `ERROR_CODES`; a narrower schema would hide their message, which is what a reviewer needs after schema drift. | research (CLAUDE.md, plan review) |
| Non-2xx responses | Parse the body as a GraphQL result first and report its first error's code and message; fall back to "HTTP <status>" only when the body is not a GraphQL result | Yoga returns 4xx with a GraphQL `errors` body for validation errors; reporting only the status would drop the message. | plan review |
| Untested CLI wiring | Accept that the `import.meta.main` entry, the `setTimeout` sleep and the default `SEED_ADDRESSES` / `globalThis.fetch` wiring in `seed-cli.ts` have no automated test; the human check runs them | Same trade-off as `migrate-cli.ts`; a test would need a real API or would re-test `runSeed`. | plan review |
| Output | One line per address to stdout ("created", "skipped (already exists)"), errors to stderr, a final summary "N created, M skipped". No variables or keys are logged beyond the address being seeded. | A reviewer sees what was spent. | planner default |
| Empty-database check before seeding | None; the duplicate rule makes a non-empty database safe | AC says "given an empty database"; extra query adds nothing. | planner default |
| "Never run automatically" proof | Tooling guardrail test scanning the files listed in *Findings* | The AC states a negative; a test keeps it true when Compose or CI change. | planner default |

## Design

**Config** (`apps/api/src/config/env.ts`): add `SEED_API_URL` to `REASONS` ("expected a URL")
and a `loadSeedConfig(env): SeedConfig` with `z.object({ SEED_API_URL: z.url().default('http://localhost:4000/graphql') })`
→ `{ apiUrl }`, parsed through the existing `parseEnv`. `loadConfig` and `loadDatabaseConfig`
are unchanged.

**Addresses** (`apps/api/src/seed/addresses.ts`): `export const SEED_ADDRESSES: readonly SeedAddress[]`,
where `SeedAddress = { street, city, state, zipCode }` (all strings). A unit test asserts every
entry passes the shared address schema (`packages/shared/src/address.ts`), so a typo fails
before any quota is spent.

**Seed** (`apps/api/src/seed/seed.ts`):
```ts
type SeedDeps = {
  apiUrl: string;
  addresses: readonly SeedAddress[];
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};
export async function runSeed(deps: SeedDeps): Promise<0 | 1>;
```
- For each address: POST `{ query: CREATE_PROPERTY, variables: address }` as JSON.
- Classify the response with zod, whatever the HTTP status: `created` (has
  `data.createProperty.id`), `exists` (first error code `PROPERTY_ALREADY_EXISTS`), or `failed`
  with a reason: the first error's code (any string, or "no code") and message; for a body that
  is not a GraphQL result, "HTTP <status>" when the status is not 2xx, otherwise
  "unexpected response"; for a thrown `fetch`, the network reason below.
- `created` → stdout, then `sleep(1500)` unless it was the last address. `exists` → stdout, no
  sleep. `failed` → stderr naming the address and reason, return 1 without trying the rest.
- End: stdout summary, return 0.
- Error model: `runSeed` never throws for an expected failure; a thrown `fetch` (API down) is a
  `failed` reason ("could not reach <apiUrl>"). The URL holds no secret.

**CLI** (`apps/api/src/seed/seed-cli.ts`): `runSeedCli(env, io): Promise<0 | 1>` loads
`loadSeedConfig` (a `ConfigError` → stderr, 1) and calls `runSeed` with `globalThis.fetch`,
`setTimeout`-based sleep and `SEED_ADDRESSES`; `if (import.meta.main)` sets `process.exitCode`,
as in `migrate-cli.ts`.

**Scripts**: `apps/api/package.json` `"seed": "node --env-file-if-exists=../../.env src/seed/seed-cli.ts"`;
root `"seed": "pnpm --filter @property-manager/api seed"`. Not referenced anywhere else.

## Seed addresses
| # | Landmark | street | city | state | zipCode | Source |
|---|----------|--------|------|-------|---------|--------|
| 1 | Colorado State Capitol | 200 E Colfax Ave | Denver | CO | 80203 | Denver Public Library, AAA |
| 2 | Texas State Capitol | 1100 Congress Ave | Austin | TX | 78701 | Texas State Library, AFAR |
| 3 | Space Needle | 400 Broad St | Seattle | WA | 98109 | AAA, Time Out |
| 4 | Georgia State Capitol | 206 Washington St SW | Atlanta | GA | 30334 | georgia.gov, Georgia Building Authority |
| 5 | Arizona Capitol Museum | 1700 W Washington St | Phoenix | AZ | 85007 | azcapitolmuseum.gov |

All five cities are at least about 100 km from a state or national border (Atlanta is the closest), so Weatherstack's region should
match the state (R-03). The human check confirms it with the real key.

## Phases
### Phase 1: Documented, manual demo seed through createProperty
- Files:
  - `apps/api/src/config/env.ts`: `SEED_API_URL` reason and `loadSeedConfig`. Contract:
    `loadSeedConfig(env): Readonly<{ apiUrl: string }>`; missing → default; invalid →
    `ConfigError` "Invalid environment variable: SEED_API_URL (expected a URL)".
  - `apps/api/src/config/env.test.ts`: default, explicit value, invalid value (message names the
    variable, not the value), and `loadConfig` still ignores `SEED_API_URL`.
  - `apps/api/src/seed/addresses.ts`: the five addresses in *Seed addresses*. Contract:
    `SEED_ADDRESSES`, 3–6 entries, all valid per the shared address schema, no two with the
    same duplicate key (D-07: street and city lower-cased after `addressSchema` parsing, plus
    state and zip).
  - `apps/api/src/seed/seed.ts`: `runSeed` as in *Design*.
  - `apps/api/src/seed/seed-cli.ts`: `runSeedCli` and the `import.meta.main` entry.
  - `apps/api/src/seed/seed.test.ts` (api-unit, MSW `http.post` on a test URL, fake `sleep` and
    captured lines):
    - all created → exit 0, one request per address in order with exactly the address as
      variables, the mutation is `createProperty`, summary counts, `sleep(1500)` between creates
      and not after the last;
    - the 2nd address returns `PROPERTY_ALREADY_EXISTS` → skipped, the rest still sent, no sleep
      after the skip, exit 0;
    - the 2nd returns each other code (`it.each` over `ERROR_CODES` minus the duplicate, e.g.
      `WEATHER_QUOTA_EXCEEDED`) → stderr names the address and the code, the 3rd is never
      sent, exit 1;
    - a code outside the contract (`GRAPHQL_VALIDATION_FAILED`) and an error with no
      `extensions` → failed, stderr shows the server's message (and the code when present);
    - HTTP 400 with a GraphQL `errors` body → failed with the body's code and message, not only
      the status;
    - HTTP 500 with a non-GraphQL body, a network error (`HttpResponse.error()`), and a 200 with
      a body that is not a GraphQL result → each stops with exit 1 and its own reason (assert
      the reason, not only the exit code — lessons.md "assert an error's cause");
    - `data.createProperty` null without errors → failed.
  - `apps/api/src/seed/addresses.test.ts`: every entry parses with the shared address schema;
    the duplicate keys are unique. The key lower-cases street and city after parsing, because
    `addressSchema` keeps case while the duplicate rule (`context/prd.md:347`) ignores it.
  - `apps/api/src/seed/seed-cli.test.ts`: invalid `SEED_API_URL` → exit 1 and the config message,
    no request sent.
  - `apps/api/test/helpers/app.ts`: `TestApp` also exposes `fetch` (the app's `yoga.fetch`).
    Contract: `fetch(url, init): Promise<Response>`.
  - `apps/api/test/integration/seed.int.test.ts` (api-int, Testcontainers, `FakeWeatherClient`):
    after `resetDb`, `runSeed` with `app.fetch`, a recording no-op `sleep` (no real wait) and
    two test addresses → exit 0, `properties.totalCount` is 2 with the given addresses, the fake
    saw 2 calls, `sleep` was called once with `1500`; a second run → exit 0, both skipped, still
    2 rows, still 2 calls and no `sleep`. Proves the path goes through the real
    mutation, validation and duplicate rule.
  - `tooling/guardrails.test.ts`: new `describe('FR-16: the seed never runs automatically')`.
    Reads `docker-compose.yml`, `docker-compose.e2e.yml`, both Dockerfiles,
    `.github/workflows/ci.yml`, `.githooks/pre-commit`, every `e2e/*.ts`, `.claude/settings.json`
    and each script its hooks run (today `tooling/claude-format-hook.sh`), and asserts none
    matches `/\bseed\b/i` (the whole word, so `seeded` or `seedProperty` do not trip it, while
    `pnpm seed`, `pnpm --filter … seed` and `npm run seed` do); for the root and workspace
    `package.json` files, asserts no script other than `seed` itself matches it. The test name
    states the rule ("no file mentions the word seed"). A false hit fails loudly and is fixed by
    rewording. Control cases: the check flags a fixture containing `pnpm seed` and ignores one
    containing `seeded`.
  - `eslint.config.ts`: a `restrictImports` block for `apps/api/src/seed/**/*.ts` that forbids
    `**/graphql/**`, `**/services/**`, `**/repositories/**`, `**/adapters/**`, `**/domain/**`,
    `**/db/**`, `drizzle-orm*`, `pg` and `graphql-yoga`, so the seed stays a client of the API.
  - `package.json`, `apps/api/package.json`: the `seed` scripts.
  - `.env.example`: `SEED_API_URL=` with a comment (optional, default shown).
  - `README.md`: "Demo data" section: start the API (`docker compose up` or `pnpm dev`), run
    `pnpm seed`; it creates N properties and uses N Weatherstack calls; re-runs skip existing
    addresses for free; it stops at the first other error; it is never run automatically;
    `SEED_API_URL` for a non-default API. Recovery depends on the error: after a 429
    (`WEATHER_UNAVAILABLE`) a re-run continues where it stopped; after
    `WEATHER_LOCATION_MISMATCH` or `BAD_USER_INPUT` the same address fails again on every
    re-run, so it must be changed in `apps/api/src/seed/addresses.ts`. One line on why the
    addresses are public landmarks rather than Zillow homes (B-N7). Add `SEED_API_URL` to
    *Environment variables*.
  - `context/test-plan.md`: new TR-29 (FR-16 AC1: seed goes through the mutation, skips
    duplicates, stops on other errors, never automatic → unit + api-int + tooling guardrail).
    Mutation-target row for `apps/api/src/seed/seed.ts` (response classification and
    stop/continue logic), target 90%, first run records "baseline N%". Update the "Should and
    Could items" note.
  - `context/roadmap.md`: S-10 status `done` at the end (by `/implement`).
- Proves: FR-16 AC1 — "created through the create-property mutation" (api-int through the real
  app + unit request assertions), "a few real US addresses" (addresses unit test against the
  shared schema + human check), "never run automatically" (tooling guardrail), "documented"
  (README, human check).
- Agent checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`,
  `pnpm vitest run --project api-int`, `pnpm test`. Afterwards `/mutation demo-seed-data` on
  `apps/api/src/seed/seed.ts` (and `config/env.ts`, an existing target).
- Human checks:
  - With the real key: `docker compose up -d --build`, then `pnpm seed` on an empty database.
    Every address is created (no `WEATHER_LOCATION_MISMATCH`), the list page shows them with
    sensible city-level coordinates. Run `pnpm seed` again: all skipped. This spends N calls of
    the monthly quota, once.
  - Read the README "Demo data" section.
- Commit: `feat(demo-seed-data): add a manual seed command that creates properties through the API`
  with `Refs #13`; `Closes #13` goes on the last commit of the item (review R3).

## Risks and unknowns
- R-03 (region vs. state mismatch): an address near a state border could be rejected with
  `WEATHER_LOCATION_MISMATCH`, which stops the seed. Unlike a 429, a re-run hits the same
  address and fails again, so the fix is to edit `addresses.ts` (documented in the README).
  Mitigation: pick addresses away from borders; the human check runs them once.
- R-01 (quota): each first run spends N calls. Documented in the README; duplicates are free.
- The 1.5 s spacing is based on the README's "about a second" observation, not on Weatherstack
  documentation. A 429 stops the seed with a clear `WEATHER_UNAVAILABLE`; re-running continues
  where it stopped because created addresses are skipped.
- Real addresses in a public repo: the brief recommends Zillow, but its listings are mostly
  private homes. The seed uses public landmarks instead (*Seed addresses*).

## Progress
<!-- One line per phase. /implement ticks it and appends the commit hash. -->
- [x] Phase 1: Documented, manual demo seed through createProperty (bc9585a)

## Deviations
- Phase 1, guardrail scope: the plan adds the `src/seed/` ESLint block without a test; the
  NFR-06 table in `tooling/guardrails.test.ts` now also gets four `seed → …` rejects and a control (`seed → config`)
  so the new block is proved like the other layers. The hook scan follows `tooling/` script
  references transitively, so it covers `claude-format-hook.ts` as well as the `.sh` wrapper,
  and a control asserts both `seed` scripts exist.
- Phase 1, follow-up (done after review R2): the `CLAUDE.md` *Commands* table now lists
  `pnpm seed`, so the README claim that every command is there holds.
- Review R1: an API-wide ESLint block (`apps/api/src/**` minus `src/seed/**`) and every layer
  block reject imports of `**/seed/**`, so the app cannot run the seed at startup. NFR-06 rows
  `main / app / service / domain → seed` and a control (`seed-cli → seed`) prove it.
