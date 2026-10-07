# Lessons

## Re-run Stryker at lower concurrency before recording a score whose kills are mostly timeouts
- Why: Stryker counts a timeout as caught. Under load (default runner count) mutants time out
  instead of failing, so the score looks high while real survivors hide behind the timeouts.
  In F-02, 27 of 38 `migrate-cli.ts` mutants timed out at 15 runners. At `--concurrency 4`
  none timed out, and 14 survived.
- Seen in: property-schema, mutation check
- Scope: every `/mutation` run (`stryker.config.json` in `apps/api`, `apps/web`,
  `packages/shared`, `tooling`)

## Assert an error's cause or code, not only its type
- Why: a test that checks only `toBeInstanceOf(WeatherUnavailableError)` passes when the cause
  is empty, wrong, or comes from a different failure path. In S-01, 23 of the 32 adapter
  survivors (`client.ts`, `response.ts`) came from such tests. One TR-01 test passed only
  because the logged URL already contained `[REDACTED]`, so it never checked the redacted
  error message it was written for.
- Seen in: create-property-with-weather, mutation check
- Scope: tests of adapters and error mapping (`apps/api/src/adapters/`, `graphql/errors.ts`).
  Assert `cause` / `extensions.code` and the logged details, not just the class.
