# Lessons

## Re-run Stryker at lower concurrency before recording a score whose kills are mostly timeouts
- Why: Stryker counts a timeout as caught. Under load (default runner count) mutants time out
  instead of failing, so the score looks high while real survivors hide behind the timeouts.
  In F-02, 27 of 38 `migrate-cli.ts` mutants timed out at 15 runners. At `--concurrency 4`
  none timed out, and 14 survived.
- Seen in: property-schema, mutation check
- Scope: every `/mutation` run (`stryker.config.json` in `apps/api`, `apps/web`,
  `packages/shared`, `tooling`)
