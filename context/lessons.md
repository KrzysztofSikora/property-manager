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

## Test log redaction with the sensitive data where the filter must skip it
- Why: a test that only checks that the output is clean passes when the filter is weakened, if
  the fixture never puts the secret where the weakened filter would let it through. In S-01,
  dropping the `^` anchor from the stack-frame regex in `summarizeError` survived: no fixture
  message contained " at ", so the `Name: message` line was never mistaken for a frame.
- Seen in: create-property-with-weather, mutation re-run after review
- Scope: redaction and log-summary code (`adapters/weatherstack/redact.ts`, `graphql/errors.ts`,
  `db/migrate-cli.ts`, `tooling/secret-scan.ts`). Add a case where the secret sits in the
  part the filter must drop and looks like what it keeps.

## A service test must be able to fail through the service, not only through a fake
- Why: a test whose outcome depends only on the in-memory fake (or that repeats a pure-function
  table through the service) passes whatever the service does, so it adds run time and no
  protection. In S-02, "an address with a different %s is stored" could fail only if
  `InMemoryPropertyRepository.existsByAddress` changed, and the case/spacing region test repeated
  the TR-09 `regionMatchesState` table; the mutation run showed neither killed a mutant the
  others missed.
- Seen in: create-property-guards, review R3
- Scope: service tests with fakes (`apps/api/src/services/*.test.ts`). Before adding a test, name
  the service line that would make it fail. Rules owned by the repository are proved against
  PostgreSQL (`*.int.test.ts`); pure helpers are proved by their own table.

## Test per-field validation with exactly one invalid field
- Why: a test that makes several fields invalid at once passes when the code assumes a given
  field always has an issue. In S-05, `issues.zipCode?.[0]` → `issues.zipCode[0]` survived:
  every AC1 test had an invalid zip, so a valid zip next to an empty street (the handler throws,
  no message shown) was never tried.
- Seen in: create-property-page, mutation check
- Scope: form validation and field-error mapping (`apps/web/src/pages/*Page.tsx`,
  `lib/graphql-errors.ts` `fieldErrors`, `packages/shared/src/address.ts`). Add a case where one
  field is invalid and the others are valid, and assert the others show no message.

## Re-check earlier mutation-strengthened tests when a change moves a rule's input
- Why: a test added to kill a mutant reaches the code only through the input path it was
  written for. When a change moves that input (component state → URL), the test still passes
  but no longer reaches the line, and the mutant survives again. In S-07, the S-04 test for the
  `filtered` flag (`value.trim()`) typed whitespace and clicked Apply. A whitespace Apply now
  leaves the URL unchanged, so only a link like `/?city=+++` still reaches the flag.
- Seen in: list-filters-in-url, mutation check
- Scope: `/plan` and `/mutation` for changes that move where a module reads its state (URL,
  cache, props, API args). Before the run, look up the earlier `mutation.md` `strengthen`
  rows for the touched lines and confirm that each test still reaches them.
