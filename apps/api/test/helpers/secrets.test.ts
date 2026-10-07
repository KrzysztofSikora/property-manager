import { describe, expect, it } from 'vitest';
import { expectNoSecret, TEST_WEATHERSTACK_KEY } from './secrets.ts';

function failureOf(run: () => void): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error('expected an Error', { cause: error });
  }
  throw new Error('expected expectNoSecret to fail');
}

describe('expectNoSecret', () => {
  it('passes on values without the sentinel, including a redacted URL', () => {
    expectNoSecret(
      { data: { health: 'ok' } },
      [{ level: 30, url: 'https://api.weatherstack.com/current?access_key=[REDACTED]' }],
      'plain text',
      undefined,
      null,
      42,
    );
  });

  it('TR-01: fails on a GraphQL result that contains the sentinel', () => {
    const result = { errors: [{ message: `bad key ${TEST_WEATHERSTACK_KEY}` }] };
    expect(() => {
      expectNoSecret(result);
    }).toThrow('argument 0 contains the Weatherstack key');
  });

  it('TR-01: fails on a nested log line holding the sentinel', () => {
    const lines = [
      { msg: 'graphql operation' },
      { msg: 'weather failed', err: { url: `/current?access_key=${TEST_WEATHERSTACK_KEY}` } },
    ];
    expect(() => {
      expectNoSecret({ data: null }, lines);
    }).toThrow('argument 1 contains the Weatherstack key');
  });

  it('fails on a string or an Error message holding the sentinel', () => {
    expect(() => {
      expectNoSecret(`access_key=${TEST_WEATHERSTACK_KEY}`);
    }).toThrow('argument 0');
    expect(() => {
      expectNoSecret(new Error(`GET /current?access_key=${TEST_WEATHERSTACK_KEY}`));
    }).toThrow('argument 0');
    expect(() => {
      expectNoSecret(new Error('outer', { cause: new Error(TEST_WEATHERSTACK_KEY) }));
    }).toThrow('argument 0');
  });

  it('TR-01: fails on a custom Error field or an AggregateError inner error', () => {
    const withUrl = Object.assign(new Error('weather failed'), {
      url: `/current?access_key=${TEST_WEATHERSTACK_KEY}`,
    });
    expect(() => {
      expectNoSecret(withUrl);
    }).toThrow('argument 0');
    expect(() => {
      expectNoSecret(new AggregateError([new Error(`k=${TEST_WEATHERSTACK_KEY}`)], 'many'));
    }).toThrow('argument 0');
  });

  it('does not repeat the matched text in its failure message', () => {
    const error = failureOf(() => {
      expectNoSecret({ url: `https://example.test/?access_key=${TEST_WEATHERSTACK_KEY}` });
    });
    expect(error.message).not.toContain(TEST_WEATHERSTACK_KEY);
    expect(error.message).not.toContain('example.test');
  });
});
