import { useQuery } from '@tanstack/react-query';
import { graphql } from '../graphql';
import { execute } from '../lib/execute';

// Every field the details page shows. `raw` is left out until #11.
const PropertyQuery = graphql(`
  query Property($id: ID!) {
    property(id: $id) {
      id
      street
      city
      state
      zipCode
      lat
      long
      createdAt
      weatherData {
        units
        current {
          temperature
          feelsLike
          weatherDescriptions
          weatherIcons
          windSpeed
          windDir
          humidity
        }
      }
    }
  }
`);

// `data.property` is `null` when no property has this id (unknown or malformed).
export function useProperty(id: string) {
  return useQuery({
    queryKey: ['properties', 'detail', id],
    queryFn: () => execute(PropertyQuery, { id }),
  });
}
