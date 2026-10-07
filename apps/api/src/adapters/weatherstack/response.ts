import { z } from 'zod';
import { WeatherUnavailableError } from '../../domain/errors.ts';
import { currentKeyFieldsSchema } from '../../domain/weather.ts';
import type { WeatherReport } from '../../domain/weather.ts';

// `z.coerce.number()` would accept "" as 0, so the decimal string is checked first.
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number);

const responseSchema = z.object({
  location: z.object({
    lat: decimalString,
    lon: decimalString,
    region: z.string().min(1),
  }),
  current: currentKeyFieldsSchema,
});

// Weatherstack reports API errors with HTTP 200 and this body. S-02 classifies the codes.
const errorBodySchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.number().optional(), type: z.string().optional() }).optional(),
});

// The cause never holds the body: only the error code, or the paths that failed to parse.
export function parseWeatherstackResponse(body: unknown): WeatherReport {
  const failure = errorBodySchema.safeParse(body);
  if (failure.success) {
    const { code, type } = failure.data.error ?? {};
    throw new WeatherUnavailableError({ cause: { weatherstackError: { code, type } } });
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.map(String).join('.'));
    throw new WeatherUnavailableError({ cause: { issues } });
  }

  const { location, current } = parsed.data;
  return { lat: location.lat, long: location.lon, region: location.region, current };
}
