/* eslint-disable */
import * as types from './graphql.ts';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {\n    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {\n      id\n    }\n  }\n": typeof types.CreatePropertyDocument,
    "\n  mutation DeleteProperty($id: ID!) {\n    deleteProperty(id: $id)\n  }\n": typeof types.DeletePropertyDocument,
    "\n  query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {\n    properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {\n      items {\n        id\n        street\n        city\n        state\n        zipCode\n        createdAt\n      }\n      totalCount\n    }\n  }\n": typeof types.PropertiesDocument,
    "\n  query Property($id: ID!) {\n    property(id: $id) {\n      id\n      street\n      city\n      state\n      zipCode\n      lat\n      long\n      createdAt\n      weatherData {\n        units\n        current {\n          temperature\n          feelsLike\n          weatherDescriptions\n          weatherIcons\n          windSpeed\n          windDir\n          humidity\n        }\n      }\n    }\n  }\n": typeof types.PropertyDocument,
};
const documents: Documents = {
    "\n  mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {\n    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {\n      id\n    }\n  }\n": types.CreatePropertyDocument,
    "\n  mutation DeleteProperty($id: ID!) {\n    deleteProperty(id: $id)\n  }\n": types.DeletePropertyDocument,
    "\n  query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {\n    properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {\n      items {\n        id\n        street\n        city\n        state\n        zipCode\n        createdAt\n      }\n      totalCount\n    }\n  }\n": types.PropertiesDocument,
    "\n  query Property($id: ID!) {\n    property(id: $id) {\n      id\n      street\n      city\n      state\n      zipCode\n      lat\n      long\n      createdAt\n      weatherData {\n        units\n        current {\n          temperature\n          feelsLike\n          weatherDescriptions\n          weatherIcons\n          windSpeed\n          windDir\n          humidity\n        }\n      }\n    }\n  }\n": types.PropertyDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {\n    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {\n      id\n    }\n  }\n"): typeof import('./graphql.ts').CreatePropertyDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteProperty($id: ID!) {\n    deleteProperty(id: $id)\n  }\n"): typeof import('./graphql.ts').DeletePropertyDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {\n    properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {\n      items {\n        id\n        street\n        city\n        state\n        zipCode\n        createdAt\n      }\n      totalCount\n    }\n  }\n"): typeof import('./graphql.ts').PropertiesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Property($id: ID!) {\n    property(id: $id) {\n      id\n      street\n      city\n      state\n      zipCode\n      lat\n      long\n      createdAt\n      weatherData {\n        units\n        current {\n          temperature\n          feelsLike\n          weatherDescriptions\n          weatherIcons\n          windSpeed\n          windDir\n          humidity\n        }\n      }\n    }\n  }\n"): typeof import('./graphql.ts').PropertyDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
