import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// S-01 narrows `current` when it adds the Weatherstack mapper.
export type WeatherSnapshot = { units: 'IMPERIAL'; current: Record<string, unknown> };

// Change this file and run `pnpm db:generate`; never edit a generated migration by hand.
// The CHECKs are a backstop for NFR-08. The full rules (state list, address format) live in
// the zod schemas and `@property-manager/shared`.
export const properties = pgTable(
  'properties',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    street: text('street').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    zipCode: text('zip_code').notNull(),
    lat: doublePrecision('lat').notNull(),
    long: doublePrecision('long').notNull(),
    weatherData: jsonb('weather_data').$type<WeatherSnapshot>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Trimming and whitespace collapse happen before storage (S-01); state is upper-case.
    uniqueIndex('properties_address_unique').on(
      sql`lower(${t.street})`,
      sql`lower(${t.city})`,
      t.state,
      t.zipCode,
    ),
    check('properties_state_format', sql`${t.state} ~ '^[A-Z]{2}$'`),
    check('properties_zip_code_format', sql`${t.zipCode} ~ '^[0-9]{5}$'`),
    check('properties_lat_range', sql`${t.lat} BETWEEN -90 AND 90`),
    check('properties_long_range', sql`${t.long} BETWEEN -180 AND 180`),
    // jsonb `?` also matches string elements of an array, hence the type check first.
    check(
      'properties_weather_data_shape',
      sql`jsonb_typeof(${t.weatherData}) = 'object' AND ${t.weatherData} ? 'units' AND ${t.weatherData} ? 'current'`,
    ),
  ],
);

export type PropertyRow = typeof properties.$inferSelect;

export type NewPropertyRow = typeof properties.$inferInsert;
