# Review: demo-seed-data

Verdict: APPROVE
Gates: typecheck ok, lint ok, format:check ok, tests 734 passed / 0 failed (`pnpm test`, 44 files,
incl. api-int on Testcontainers)

Base: `main` (no commit carries `(demo-seed-data)` yet). The whole change is uncommitted, on
purpose: `/implement` holds the commit until the two human checks are confirmed.

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/api/src/config/env.ts` | done | `SEED_API_URL` reason, `seedEnvSchema` with the default, `loadSeedConfig`; `loadConfig` / `loadDatabaseConfig` unchanged. |
| `apps/api/src/config/env.test.ts` | done | Unset / empty → default, explicit value without the key, invalid value named without echo, `loadConfig` ignores it. |
| `apps/api/src/seed/addresses.ts` | done | The five landmarks from *Seed addresses*. |
| `apps/api/src/seed/addresses.test.ts` | done | Count 3–6, shared schema round trip, D-07 key uniqueness (lower-cased street and city). |
| `apps/api/src/seed/seed.ts` | done | `runSeed` as designed: zod classification whatever the status, skip / stop, 1.5 s spacing only after a create that is not last, network error → "could not reach <url>". |
| `apps/api/src/seed/seed.test.ts` | done | Every planned case, plus several errors, empty errors list, property without id, empty list. |
| `apps/api/src/seed/seed-cli.ts` | done | Mirrors `migrate-cli.ts`. |
| `apps/api/src/seed/seed-cli.test.ts` | done | Invalid URL → exit 1, config message, no request. |
| `apps/api/test/helpers/app.ts` | done | `fetch` exposed as `yoga.fetch`. |
| `apps/api/test/integration/seed.int.test.ts` | done | 2 created, 2 fake weather calls, one `sleep(1500)`; re-run skips both with no call and no sleep. |
| `tooling/guardrails.test.ts` | done | FR-16 scan plus the NFR-06 seed rows (logged under *Deviations*). |
| `eslint.config.ts` | done | `src/seed/**` block as planned. |
| `package.json`, `apps/api/package.json` | done | `seed` scripts. |
| `.env.example` | done | Commented `SEED_API_URL` with its default. |
| `README.md` | done | "Demo data" section and the env table row. See R2. |
| `context/test-plan.md` | done | TR-29, `seed.ts` mutation target (baseline 96.1%), `env.ts` row updated, Could-items note. |
| `context/roadmap.md` | done | S-10 row added; status set to `review` by this review. |
| `context/changes/demo-seed-data/mutation.md` | unplanned | Output of `/mutation`, expected. |
| `CLAUDE.md` | absent | Not planned; *Deviations* records the missing `pnpm seed` row as a follow-up (see R2). |
| `implement-S-10.txt`, `mutation-S-10.txt`, `plan-S-10.txt`, `plan-review-S-10.txt` | unplanned | Session exports in the repo root; earlier items move them to `ai-sessions/NN-*.txt` in the review commit. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | All classifications, skip / stop and spacing match the plan; the int test proves the real mutation, duplicate rule and zero-quota re-run. |
| Design | ok | Seed is an HTTP client of the API with injected `fetch` / `sleep` / IO; the ESLint block keeps it out of the layers. |
| Safety | ok | Response validated with zod; the env message never echoes the value; no key is read or logged; no real Weatherstack call in tests. |
| Tests | ok | Behavioural assertions on stdout / stderr / requests; every failure path asserts its own reason (lessons.md); mutation decisions plausible. |
| Simplicity | ok | Small modules, no dead code. |
| Plan fidelity | concern | "Never automatic" guardrail leaves the app's own startup path open (R1); README now claims a command list that misses `pnpm seed` (R2). |

## Findings
### R1: Nothing stops the app itself from running the seed at startup
- Severity: minor
- Where: `eslint.config.ts:93-106`, `tooling/guardrails.test.ts:368-412`
- Problem: the FR-16 guardrail scans Compose, Dockerfiles, CI, the git hook, `e2e/*.ts`, the
  Claude hooks and package scripts for the word `seed`, but not the API's own code, which
  Compose and `pnpm dev` start automatically. The new ESLint block restricts what `src/seed/`
  imports, not who imports it. Verified:
  `import { runSeed } from './seed/seed.ts'` linted as `apps/api/src/main.ts` passes with exit 0,
  and the guardrail does not read `main.ts`. "Seed an empty database on startup" is the most
  likely way an automatic seed would come in, and TR-29 says this risk is covered.
- Fix: add an ESLint `restrictImports` entry so no file under `apps/api/src/` outside
  `src/seed/` may import `**/seed/**`, plus one NFR-06 row (`main → seed` rejected) in
  `tooling/guardrails.test.ts`. The base block would need the pattern too, which means a
  `files` / `ignores` pair for `apps/api/src/**` minus `src/seed/**`.
- Effort: small
- Decision: fix. `eslint.config.ts` adds `restrictApiImports`, which puts a `**/seed/**` pattern (FR-16 message) on a new `apps/api/src/**` block that ignores `src/seed/**` and on every layer block. `tooling/guardrails.test.ts` gains `main → seed`, `app → seed`, `service → seed`, `domain → seed addresses` rejects and a `seed-cli → seed` control. TR-29 in `context/test-plan.md` mentions the rule. Verified: the reviewer's `main.ts` import now fails with `no-restricted-imports`.

### R2: README says every command is in CLAUDE.md, but `pnpm seed` is not
- Severity: minor
- Where: `README.md:73-74`, `CLAUDE.md` *Commands*
- Problem: the README states "All project commands are listed in CLAUDE.md#commands". This
  change adds `pnpm seed` to the README only, so the statement becomes false and agents working
  from `CLAUDE.md` do not know the command (or its quota cost). *Deviations* already records
  the CLAUDE.md row as a follow-up, but not that the README claim now contradicts it.
- Fix: add a row to the CLAUDE.md *Commands* table, e.g. "Demo data (API running; spends one
  Weatherstack call per new address; never automatic) | `pnpm seed`".
- Effort: small
- Decision: fix. `CLAUDE.md` *Commands* gains "Demo data (API running; one Weatherstack call per new address; never automatic) | `pnpm seed`"; the plan *Deviations* entry is updated.

### R3: The planned commit closes #13 before the mutation and review commits
- Severity: minor
- Where: `context/changes/demo-seed-data/plan.md` *Phases* → Commit
- Problem: CLAUDE.md requires `Refs #<n>` on every commit and `Closes #<n>` only on the last
  commit of a roadmap item. The plan (and the commit `/implement` proposes) puts `Closes #13` on
  the `feat` commit, while the mutation record, this review and the session exports follow in
  later commits. S-09 did the same (`3d71c6d` and `ef486e8` both close #11 / #12).
- Fix: use `Refs #13` in the `feat` commit (and any fix commit) and `Closes #13` in the final
  docs / review commit.
- Effort: small
- Decision: fix. The `feat` and `fix` commits use `Refs #13`; the final docs commit uses `Closes #13`. The plan's commit line says so.
