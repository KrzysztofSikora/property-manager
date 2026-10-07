import { parseWeatherstackResponse } from '../../src/adapters/weatherstack/response.ts';
import type { WeatherClient } from '../../src/domain/ports.ts';
import type { WeatherReport } from '../../src/domain/weather.ts';
import { weatherstackResponse } from '../fixtures/weatherstack.ts';

type Barrier = { size: number; arrived: number; released: PromiseWithResolvers<void> };

// The `WeatherClient` for tests: serves a Weatherstack body through the real response parser,
// so a broken fixture or an error body fails with `WeatherUnavailableError`, as in production.
export class FakeWeatherClient implements WeatherClient {
  readonly calls: string[] = [];
  readonly #body: unknown;
  #barrier: Barrier | undefined;

  constructor(body: unknown = weatherstackResponse()) {
    this.#body = body;
  }

  // Holds every call until `n` have arrived, then releases them together (FR-08 AC2 races).
  static withBarrier(n: number, body?: unknown): FakeWeatherClient {
    const fake = new FakeWeatherClient(body);
    fake.#barrier = { size: n, arrived: 0, released: Promise.withResolvers() };
    return fake;
  }

  async current(query: string): Promise<WeatherReport> {
    this.calls.push(query);
    const barrier = this.#barrier;
    if (barrier !== undefined) {
      barrier.arrived += 1;
      if (barrier.arrived >= barrier.size) barrier.released.resolve();
      await barrier.released.promise;
    }
    return parseWeatherstackResponse(structuredClone(this.#body));
  }
}
