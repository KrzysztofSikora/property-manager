import { isStateCode } from '@property-manager/shared';
import { z } from 'zod';
import type { PropertySort } from '../graphql/graphql';
import type { PropertiesFilter } from '../hooks/useProperties';

export type ListState = { filter: PropertiesFilter; sort: PropertySort };

// Each field falls back on its own, so one bad value drops only that field. The bounds match
// the form inputs, so the URL never holds a value the inputs can't show.
const listSearchSchema = z.object({
  city: z.string().max(100).catch(''),
  state: z
    .string()
    .toUpperCase()
    .refine((value): boolean => isStateCode(value))
    .catch(''),
  zip: z.string().max(5).catch(''),
  sort: z.literal('asc').optional().catch(undefined),
});

/** Reads the list filters and sort from the URL. Invalid values are ignored. */
export function parseListSearch(params: URLSearchParams): ListState {
  // `get` returns the first value of a repeated key, and null for a missing one.
  const search = listSearchSchema.parse({
    city: params.get('city'),
    state: params.get('state'),
    zip: params.get('zip'),
    sort: params.get('sort') ?? undefined,
  });
  return {
    filter: { city: search.city, state: search.state, zipCode: search.zip },
    sort: search.sort === 'asc' ? 'CREATED_AT_ASC' : 'CREATED_AT_DESC',
  };
}

/** Writes the list state to URL params: trimmed, blanks and the default sort left out. */
export function toListSearch({ filter, sort }: ListState): URLSearchParams {
  const params = new URLSearchParams();
  const fields: [string, string][] = [
    ['city', filter.city],
    ['state', filter.state],
    ['zip', filter.zipCode],
  ];
  for (const [key, value] of fields) {
    if (value.trim()) params.set(key, value.trim());
  }
  if (sort === 'CREATED_AT_ASC') params.set('sort', 'asc');
  return params;
}
