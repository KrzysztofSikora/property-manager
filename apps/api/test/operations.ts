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
