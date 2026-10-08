import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { graphql } from '../graphql';
import type { PropertyFilter, PropertySort } from '../graphql/graphql';
import { execute } from '../lib/execute';

const PropertiesQuery = graphql(`
  query Properties($filter: PropertyFilter, $sort: PropertySort) {
    properties(filter: $filter, sort: $sort) {
      items {
        id
        street
        city
        state
        zipCode
        createdAt
      }
      totalCount
    }
  }
`);

export type PropertiesFilter = { city: string; state: string; zipCode: string };

// Blank values are left out, so the request carries only the filters the user set.
function toFilter({ city, state, zipCode }: PropertiesFilter): PropertyFilter {
  const filter: PropertyFilter = {};
  if (city.trim()) filter.city = city.trim();
  if (state) filter.state = state;
  if (zipCode.trim()) filter.zipCode = zipCode.trim();
  return filter;
}

export function useProperties({ filter, sort }: { filter: PropertiesFilter; sort: PropertySort }) {
  return useQuery({
    queryKey: ['properties', 'list', { filter, sort }],
    // No `limit`: the list shows every match (pagination is #10).
    queryFn: () => execute(PropertiesQuery, { filter: toFilter(filter), sort }),
    // Keep the current rows on screen while a new sort or filter loads.
    placeholderData: keepPreviousData,
  });
}
