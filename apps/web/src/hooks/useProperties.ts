import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { graphql } from '../graphql';
import type { PropertyFilter, PropertySort } from '../graphql/graphql';
import { execute } from '../lib/execute';

const PropertiesQuery = graphql(`
  query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {
    properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      items {
        id
        street
        city
        state
        zipCode
        createdAt
        weatherData {
          current {
            temperature
            weatherDescriptions
            weatherIcons
          }
        }
      }
      totalCount
    }
  }
`);

// Rows per list page (FR-11 AC4).
export const PAGE_SIZE = 20;

export type PropertiesFilter = { city: string; state: string; zipCode: string };

// Blank values are left out, so the request carries only the filters the user set.
function toFilter({ city, state, zipCode }: PropertiesFilter): PropertyFilter {
  const filter: PropertyFilter = {};
  if (city.trim()) filter.city = city.trim();
  if (state) filter.state = state;
  if (zipCode.trim()) filter.zipCode = zipCode.trim();
  return filter;
}

export function useProperties({
  filter,
  sort,
  page,
}: {
  filter: PropertiesFilter;
  sort: PropertySort;
  page: number;
}) {
  return useQuery({
    queryKey: ['properties', 'list', { filter, sort, page }],
    queryFn: () =>
      execute(PropertiesQuery, {
        filter: toFilter(filter),
        sort,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    // Keep the current rows on screen while a new sort, filter or page loads.
    placeholderData: keepPreviousData,
  });
}
