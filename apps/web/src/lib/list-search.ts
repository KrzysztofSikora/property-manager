import { isStateCode } from '@property-manager/shared';
import { z } from 'zod';
import type { PropertySort } from '../graphql/graphql';
import type { PropertiesFilter } from '../hooks/useProperties';

export type ListState = { filter: PropertiesFilter; sort: PropertySort; page: number };

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
  // No leading zero, sign or decimal; 6 digits keep the request offset inside GraphQL `Int`.
  page: z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .transform(Number)
    .catch(1),
});

/** Reads the list filters, sort and page from the URL. Invalid values are ignored. */
export function parseListSearch(params: URLSearchParams): ListState {
  // `get` returns the first value of a repeated key, and null for a missing one.
  const search = listSearchSchema.parse({
    city: params.get('city'),
    state: params.get('state'),
    zip: params.get('zip'),
    sort: params.get('sort') ?? undefined,
    page: params.get('page'),
  });
  return {
    filter: { city: search.city, state: search.state, zipCode: search.zip },
    sort: search.sort === 'asc' ? 'CREATED_AT_ASC' : 'CREATED_AT_DESC',
    page: search.page,
  };
}

/**
 * Writes the list state to URL params: trimmed, blanks, the default sort and page 1 left out.
 * Leave `page` out to go back to page 1 (a filter or sort change).
 */
export function toListSearch({
  filter,
  sort,
  page = 1,
}: Omit<ListState, 'page'> & { page?: number }): URLSearchParams {
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
  if (page > 1) params.set('page', String(page));
  return params;
}
