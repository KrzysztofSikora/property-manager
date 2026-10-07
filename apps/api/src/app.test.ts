import { describe, expect, it } from 'vitest';
import { InMemoryPropertyRepository } from '../test/fakes/property-repository.ts';
import { FakeWeatherClient } from '../test/fakes/weather.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config/env.ts';
import { createLogger } from './logger.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup() {
  const lines: unknown[] = [];
  const logger = createLogger('info', {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  });
  const config = loadConfig({ WEATHERSTACK_KEY: 'TEST_WEATHERSTACK_KEY' });
  const { yoga } = createApp({
    config,
    logger,
    repository: new InMemoryPropertyRepository(),
    weather: new FakeWeatherClient(),
  });
  const operationLines = () =>
    lines.filter(
      (line): line is { msg: string; requestId: unknown } =>
        typeof line === 'object' &&
        line !== null &&
        'msg' in line &&
        line.msg === 'graphql operation',
    );
  return { yoga, operationLines };
}

async function queryHealth(yoga: ReturnType<typeof setup>['yoga']): Promise<unknown> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query Health { health }' }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

describe('createApp', () => {
  it('answers the health query', async () => {
    const { yoga } = setup();
    expect(await queryHealth(yoga)).toEqual({ data: { health: 'ok' } });
  });

  it('logs one operation line per request with its own requestId', async () => {
    const { yoga, operationLines } = setup();

    await queryHealth(yoga);
    expect(operationLines()).toHaveLength(1);
    expect(operationLines()[0]).toMatchObject({ operationName: 'Health' });

    await queryHealth(yoga);
    const [first, second] = operationLines();
    expect(operationLines()).toHaveLength(2);
    expect(first?.requestId).toMatch(UUID);
    expect(second?.requestId).toMatch(UUID);
    expect(first?.requestId).not.toBe(second?.requestId);
  });

  it.each([
    ['a parse error', '{ health ', 'parse_error'],
    ['a validation error', '{ nope }', 'validation_error'],
  ])('logs one operation line for %s', async (_name, query, outcome) => {
    const { yoga, operationLines } = setup();

    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    expect(response.status).toBe(200);
    expect(operationLines()).toHaveLength(1);
    expect(operationLines()[0]).toMatchObject({ operationName: null, outcome });
    expect(operationLines()[0]?.requestId).toMatch(UUID);
  });
});
