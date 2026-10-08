// The operations integration tests send, selecting every field of `Property`.
const PROPERTY_FIELDS = /* GraphQL */ `
  fragment PropertyFields on Property {
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
        weatherCode
        windDegree
        pressure
        precip
        cloudCover
        uvIndex
        visibility
        isDay
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
        raw
      }
    }
  }
`;

export const CREATE_PROPERTY = /* GraphQL */ `
  mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {
    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {
      ...PropertyFields
    }
  }
  ${PROPERTY_FIELDS}
`;

export const PROPERTY = /* GraphQL */ `
  query Property($id: ID!) {
    property(id: $id) {
      ...PropertyFields
    }
  }
  ${PROPERTY_FIELDS}
`;

export const PROPERTIES = /* GraphQL */ `
  query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {
    properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      items {
        ...PropertyFields
      }
      totalCount
    }
  }
  ${PROPERTY_FIELDS}
`;

export const DELETE_PROPERTY = /* GraphQL */ `
  mutation DeleteProperty($id: ID!) {
    deleteProperty(id: $id)
  }
`;
