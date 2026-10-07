import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

// Our own wording per variable. Zod's default messages can echo the input, which may be a secret.
const REASONS = {
  WEATHERSTACK_KEY: 'expected a non-empty string',
  WEATHERSTACK_BASE_URL: 'expected a URL',
  DATABASE_URL: 'expected a URL',
  PORT: 'expected an integer from 1 to 65535',
  LOG_LEVEL: `expected one of ${LOG_LEVELS.join(', ')}`,
} as const;

type EnvName = keyof typeof REASONS;

const envSchema = z
  .object({
    WEATHERSTACK_KEY: z.string().min(1),
    WEATHERSTACK_BASE_URL: z.url().default('https://api.weatherstack.com'),
    DATABASE_URL: z.url().default('postgres://postgres:postgres@localhost:5432/property_manager'),
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

export type Config = Readonly<z.output<typeof envSchema>>;

export type LogLevel = Config['logLevel'];

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function isEnvName(value: unknown): value is EnvName {
  return typeof value === 'string' && Object.hasOwn(REASONS, value);
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty value (as shipped in .env.example) counts as unset.
  const input: Partial<Record<EnvName, string>> = {};
  for (const name of Object.keys(REASONS)) {
    const value = env[name];
    if (isEnvName(name) && value !== undefined && value !== '') input[name] = value;
  }

  const result = envSchema.safeParse(input);
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
