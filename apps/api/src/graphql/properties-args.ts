import { normalizeAddressText } from '@property-manager/shared';
import { z } from 'zod';
import type { PropertyFilter, PropertyListQuery } from '../domain/property.ts';

// Search values, not addresses: only a length cap, so `state: "Arizona"` or a partial zip just
// match nothing (FR-03 AC3). An explicit null is "not given", as GraphQL allows for nullable
// args; a blank value too (FR-03 AC6). Messages never echo the input (FR-10).
function filterValue(normalize: (value: string) => string) {
  return z
    .string()
    .overwrite(normalize)
    .max(100, 'must be at most 100 characters')
    .nullish()
    .transform((value) => value || undefined);
}

const filterSchema = z
  .object({
    // Stored cities are normalized the same way, so "fountain  hills" still matches.
    city: filterValue(normalizeAddressText),
    state: filterValue((value) => value.trim().toUpperCase()),
    zipCode: filterValue((value) => value.trim()),
  })
  .nullish()
  .transform((value) => {
    const { city, state, zipCode } = value ?? {};
    const filter: PropertyFilter = {};
    if (city !== undefined) filter.city = city;
    if (state !== undefined) filter.state = state;
    if (zipCode !== undefined) filter.zipCode = zipCode;
    return filter;
  });

// Parses `QueryPropertiesArgs` into the service query (FR-01 AC5, FR-02 AC1).
export const propertiesArgsSchema = z
  .object({
    filter: filterSchema,
    sort: z.enum(['CREATED_AT_DESC', 'CREATED_AT_ASC']).nullish(),
    limit: z
      .int()
      .min(1, 'must be between 1 and 100')
      .max(100, 'must be between 1 and 100')
      .nullish(),
    offset: z.int().min(0, 'must be 0 or greater').nullish(),
  })
  .transform(({ filter, sort, limit, offset }) => {
    const query: PropertyListQuery = {
      filter,
      sort: sort ?? 'CREATED_AT_DESC',
      offset: offset ?? 0,
    };
    if (limit != null) query.limit = limit;
    return query;
  });
