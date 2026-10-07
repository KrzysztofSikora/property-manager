// Per-module `break`: `thresholds` in stryker.config.json applies to every run in this package,
// whose modules have different targets (context/test-plan.md, Mutation targets).
import base from './stryker.config.json' with { type: 'json' };

const { $schema: _schema, ...options } = base;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...options,
  mutate: ['src/graphql/properties-args.ts'],
  // Baseline 100% (changes/query-and-delete-properties/mutation.md).
  thresholds: { ...options.thresholds, break: 85 },
};
