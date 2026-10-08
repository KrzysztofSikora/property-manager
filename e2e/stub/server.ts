// Weatherstack stand-in for the e2e stack (docker-compose.e2e.yml). Runs under Node type
// stripping with no dependencies, so it uses only `node:` modules. Triggers: README.md.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? '8080');
const samplePath = process.env.SAMPLE_PATH ?? '/samples/weatherstack-current.json';
const sample: unknown = JSON.parse(readFileSync(samplePath, 'utf8'));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (!isRecord(sample) || !isRecord(sample.request)) {
  throw new Error(`${samplePath} is not a Weatherstack /current response`);
}
const sampleBody = sample;
const sampleRequest = sample.request;

// Weatherstack answers API errors with HTTP 200 and this body.
const QUOTA_BODY = {
  success: false,
  error: {
    code: 104,
    type: 'usage_limit_reached',
    info: 'Your monthly usage limit has been reached. Please upgrade your Subscription Plan.',
  },
};

function currentBody(query: string): unknown {
  if (query.toUpperCase().includes('QUOTA')) return QUOTA_BODY;
  return { ...sampleBody, request: { ...sampleRequest, query } };
}

// Logs neither the URL nor `access_key`: only the method, path and status.
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://stub');
  let status = 404;
  let body: unknown = { error: 'not found' };

  if (request.method === 'GET' && url.pathname === '/healthz') {
    status = 200;
    body = { ok: true };
  } else if (request.method === 'GET' && url.pathname === '/current') {
    status = 200;
    body = currentBody(url.searchParams.get('query') ?? '');
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
  console.log(`${request.method ?? '?'} ${url.pathname} ${String(status)}`);
});

server.listen(port, () => {
  console.log(`weather stub listening on ${String(port)}`);
});

// Compose stops containers with SIGTERM; PID 1 gets no default handler.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
