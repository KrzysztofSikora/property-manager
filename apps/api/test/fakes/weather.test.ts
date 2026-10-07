import { describe, expect, it } from 'vitest';
import { WeatherUnavailableError } from '../../src/domain/errors.ts';
import { weatherstackError, weatherstackResponse } from '../fixtures/weatherstack.ts';
import { FakeWeatherClient } from './weather.ts';

const QUERY = '1 Main St, Boston, MA 02108, United States';

describe('FakeWeatherClient', () => {
  it('returns the sample report by default and records the query', async () => {
    const fake = new FakeWeatherClient();

    const report = await fake.current(QUERY);

    expect(report).toMatchObject({ lat: 33.609, long: -111.729, region: 'Arizona' });
    expect(report.current).toEqual(weatherstackResponse().current);
    expect(fake.calls).toEqual([QUERY]);
  });

  it('serves the given body', async () => {
    const fake = new FakeWeatherClient(weatherstackResponse({ location: { region: 'Nevada' } }));

    await expect(fake.current(QUERY)).resolves.toMatchObject({ region: 'Nevada' });
  });

  it.each([
    ['an API error body', weatherstackError(615, 'request_failed')],
    ['a broken fixture', weatherstackResponse({ current: { humidity: undefined } })],
  ])('rejects %s the way the real client does, and still records the call', async (_case, body) => {
    const fake = new FakeWeatherClient(body);

    await expect(fake.current(QUERY)).rejects.toThrow(WeatherUnavailableError);
    expect(fake.calls).toEqual([QUERY]);
  });

  it('returns a fresh report on every call', async () => {
    const fake = new FakeWeatherClient();
    const first = await fake.current(QUERY);
    first.current.temperature = -1;

    await expect(fake.current(QUERY)).resolves.toHaveProperty('current.temperature', 82);
  });

  describe('withBarrier', () => {
    it('holds calls until n have arrived, then releases them all', async () => {
      const fake = FakeWeatherClient.withBarrier(2);
      let settled = 0;
      const first = fake.current('a').then(() => (settled += 1));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(settled).toBe(0);
      expect(fake.calls).toEqual(['a']);

      await Promise.all([first, fake.current('b')]);
      expect(settled).toBe(1);
      expect(fake.calls).toEqual(['a', 'b']);
    });

    it('lets later calls through once released', async () => {
      const fake = FakeWeatherClient.withBarrier(1);
      await fake.current('a');

      await expect(fake.current('b')).resolves.toMatchObject({ region: 'Arizona' });
    });

    it('rejects a body that fails to parse after the barrier', async () => {
      const fake = FakeWeatherClient.withBarrier(2, weatherstackError(104, 'usage_limit_reached'));

      const results = await Promise.allSettled([fake.current('a'), fake.current('b')]);

      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    });
  });
});
