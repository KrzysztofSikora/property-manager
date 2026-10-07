import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

// No default handlers: every outbound request must be mocked by the test that makes it.
export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
