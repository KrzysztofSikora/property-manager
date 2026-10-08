import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

// Our own wording per variable. Zod's default messages can echo the input, which may be a secret.
const REASONS = {
  WEATHERSTACK_KEY: 'expected a non-empty string',
  WEATHERSTACK_BASE_URL: 'expected a URL',
  DATABASE_URL: 'expected a URL',
  PORT: 'expected an integer from 1 to 65535',
  LOG_LEVEL: `expected one of ${LOG_LEVELS.join(', ')}`,
  SEED_API_URL: 'expected a URL',
} as const;

type EnvName = keyof typeof REASONS;

const databaseUrl = z.url().default('postgres://postgres:postgres@localhost:5432/property_manager');

const envSchema = z
  .object({
    WEATHERSTACK_KEY: z.string().min(1),
    WEATHERSTACK_BASE_URL: z.url().default('https://api.weatherstack.com'),
    DATABASE_URL: databaseUrl,
    PORT: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535))
      .default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  })
  .transform((env) => ({
    weatherstackKey: env.WEATHERSTACK_KEY,
    weatherstackBaseUrl: env.WEATHERSTACK_BASE_URL,
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
  }));

// For `pnpm db:migrate`, which must run without the Weatherstack key.
const databaseEnvSchema = z
  .object({ DATABASE_URL: databaseUrl })
  .transform((env) => ({ databaseUrl: env.DATABASE_URL }));

// For `pnpm seed`, a client of a running API: it needs neither the key nor the database.
const seedEnvSchema = z
  .object({ SEED_API_URL: z.url().default('http://localhost:4000/graphql') })
  .transform((env) => ({ apiUrl: env.SEED_API_URL }));

export type Config = Readonly<z.output<typeof envSchema>>;

export type DatabaseConfig = Readonly<z.output<typeof databaseEnvSchema>>;

export type SeedConfig = Readonly<z.output<typeof seedEnvSchema>>;

export type LogLevel = Config['logLevel'];

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function isEnvName(value: unknown): value is EnvName {
  return typeof value === 'string' && Object.hasOwn(REASONS, value);
}

function parseEnv<T>(
  schema: z.ZodType<T, Partial<Record<EnvName, string>>>,
  env: Record<string, string | undefined>,
): T {
  // An empty value (as shipped in .env.example) counts as unset.
  const input: Partial<Record<EnvName, string>> = {};
  for (const name of Object.keys(REASONS)) {
    const value = env[name];
    if (isEnvName(name) && value !== undefined && value !== '') input[name] = value;
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    const names = new Set(result.error.issues.map((issue) => issue.path[0]).filter(isEnvName));
    const lines = [...names].map((name) =>
      input[name] === undefined
        ? `Missing required environment variable: ${name}`
        : `Invalid environment variable: ${name} (${REASONS[name]})`,
    );
    throw new ConfigError(lines.join('\n'));
  }
  return result.data;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return parseEnv(envSchema, env);
}

export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  return parseEnv(databaseEnvSchema, env);
}

export function loadSeedConfig(env: Record<string, string | undefined>): SeedConfig {
  return parseEnv(seedEnvSchema, env);
}
