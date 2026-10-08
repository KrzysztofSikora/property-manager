import { useQuery } from '@tanstack/react-query';
import { graphql } from '../graphql';
import { execute } from '../lib/execute';

// Every field the details page shows. `raw` is left out: the page reads the typed fields.
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
          observationTime
          pressure
          precip
          cloudCover
          uvIndex
          visibility
          astro {
            sunrise
            sunset
            moonrise
            moonset
            moonPhase
            moonIllumination
          }
          airQuality {
            co
            no2
            o3
            so2
            pm2_5
            pm10
            usEpaIndex
            gbDefraIndex
          }
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
