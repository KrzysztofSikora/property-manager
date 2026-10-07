import { describe, expect, it } from 'vitest';
import { propertiesArgsSchema } from './properties-args.ts';

const DEFAULTS = { filter: {}, sort: 'CREATED_AT_DESC', offset: 0 };

function issues(args: unknown): { path: string; message: string }[] {
  const result = propertiesArgsSchema.safeParse(args);
  if (result.success) return expect.fail('expected the args to be rejected');
  return result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
}

describe('propertiesArgsSchema', () => {
  it.each([
    ['absent', {}],
    ['null', { filter: null, sort: null, limit: null, offset: null }],
  ])('FR-01 AC3, FR-02 AC1: %s args give the defaults and no limit', (_case, args) => {
    expect(propertiesArgsSchema.parse(args)).toStrictEqual(DEFAULTS);
  });

  it.each([1, 100])('FR-01 AC5: limit %i is accepted', (limit) => {
    expect(propertiesArgsSchema.parse({ limit })).toStrictEqual({ ...DEFAULTS, limit });
  });

  it.each([0, 101, -1])('FR-01 AC5: limit %i is rejected', (limit) => {
    expect(issues({ limit })).toStrictEqual([
      { path: 'limit', message: 'must be between 1 and 100' },
    ]);
  });

  it('FR-01 AC5: offset 0 is accepted, and an offset needs no limit', () => {
    expect(propertiesArgsSchema.parse({ offset: 0 })).toStrictEqual(DEFAULTS);
    expect(propertiesArgsSchema.parse({ offset: 20 })).toStrictEqual({ ...DEFAULTS, offset: 20 });
  });

  it('FR-01 AC5: offset -1 is rejected', () => {
    expect(issues({ offset: -1 })).toStrictEqual([
      { path: 'offset', message: 'must be 0 or greater' },
    ]);
  });

  it('FR-01 AC5: a bad limit and a bad offset are both reported', () => {
    expect(issues({ limit: 0, offset: -1 }).map(({ path }) => path)).toStrictEqual([
      'limit',
      'offset',
    ]);
  });

  it.each(['CREATED_AT_DESC', 'CREATED_AT_ASC'])('FR-02 AC1, AC2: sort %s is kept', (sort) => {
    expect(propertiesArgsSchema.parse({ sort })).toStrictEqual({ ...DEFAULTS, sort });
  });

  it('FR-03: filter values are normalized', () => {
    expect(
      propertiesArgsSchema.parse({
        filter: { city: '  fountain   hills ', state: ' az ', zipCode: ' 85268 ' },
      }),
    ).toStrictEqual({
      ...DEFAULTS,
      filter: { city: 'fountain hills', state: 'AZ', zipCode: '85268' },
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t '],
    ['null', null],
  ])('FR-03 AC6: an %s filter value is ignored', (_case, value) => {
    expect(
      propertiesArgsSchema.parse({ filter: { city: value, state: value, zipCode: value } }),
    ).toStrictEqual(DEFAULTS);
  });

  it.each(['city', 'state', 'zipCode'])(
    'TR-13: filter.%s may be 100 characters after trimming, not 101',
    (field) => {
      const hundred = 'a'.repeat(100);
      expect(propertiesArgsSchema.parse({ filter: { [field]: ` ${hundred} ` } })).toStrictEqual({
        ...DEFAULTS,
        filter: { [field]: field === 'state' ? hundred.toUpperCase() : hundred },
      });
      expect(issues({ filter: { [field]: `${hundred}b` } })).toStrictEqual([
        { path: `filter.${field}`, message: 'must be at most 100 characters' },
      ]);
    },
  );

  it('FR-10: messages do not echo the input', () => {
    const secretish = `${'x'.repeat(100)}SENTINEL`;
    const text = JSON.stringify(
      issues({
        filter: { city: secretish, state: secretish, zipCode: secretish },
        limit: 999_999,
        offset: -999_999,
      }),
    );
    for (const fragment of ['SENTINEL', '999999']) expect(text).not.toContain(fragment);
  });
});
