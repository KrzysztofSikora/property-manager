/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/**
 * Filters for `properties`. They combine with AND. A missing, null or blank value is ignored, and
 * each value may be at most 100 characters.
 */
export type PropertyFilter = {
  /** Case-insensitive contains match. `%`, `_` and `\` are matched literally. */
  city?: string | null | undefined;
  /** Exact match on the two-letter code, case-insensitive. */
  state?: string | null | undefined;
  /** Exact match on all five digits. */
  zipCode?: string | null | undefined;
};

/** The order of a property list. Ties on `createdAt` are broken by `id` in the same direction. */
export type PropertySort =
  /** Oldest first. */
  | 'CREATED_AT_ASC'
  /** Newest first. */
  | 'CREATED_AT_DESC';

export type WeatherUnits =
  | 'IMPERIAL';

export type CreatePropertyMutationVariables = Exact<{
  street: string;
  city: string;
  state: string;
  zipCode: string;
}>;


export type CreatePropertyMutation = { createProperty: { id: string } | null };

export type DeletePropertyMutationVariables = Exact<{
  id: string | number;
}>;


export type DeletePropertyMutation = { deleteProperty: string };

export type PropertiesQueryVariables = Exact<{
  filter?: PropertyFilter | null | undefined;
  sort?: PropertySort | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type PropertiesQuery = { properties: { totalCount: number, items: Array<{ id: string, street: string, city: string, state: string, zipCode: string, createdAt: string }> } };

export type PropertyQueryVariables = Exact<{
  id: string | number;
}>;


export type PropertyQuery = { property: { id: string, street: string, city: string, state: string, zipCode: string, lat: number, long: number, createdAt: string, weatherData: { units: WeatherUnits, current: { temperature: number, feelsLike: number, weatherDescriptions: Array<string>, weatherIcons: Array<string>, windSpeed: number, windDir: string, humidity: number, observationTime: string | null, pressure: number | null, precip: number | null, cloudCover: number | null, uvIndex: number | null, visibility: number | null, astro: { sunrise: string | null, sunset: string | null, moonrise: string | null, moonset: string | null, moonPhase: string | null, moonIllumination: number | null } | null, airQuality: { co: number | null, no2: number | null, o3: number | null, so2: number | null, pm2_5: number | null, pm10: number | null, usEpaIndex: number | null, gbDefraIndex: number | null } | null } } } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const CreatePropertyDocument = new TypedDocumentString(`
    mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {
  createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {
    id
  }
}
    `) as unknown as TypedDocumentString<CreatePropertyMutation, CreatePropertyMutationVariables>;
export const DeletePropertyDocument = new TypedDocumentString(`
    mutation DeleteProperty($id: ID!) {
  deleteProperty(id: $id)
}
    `) as unknown as TypedDocumentString<DeletePropertyMutation, DeletePropertyMutationVariables>;
export const PropertiesDocument = new TypedDocumentString(`
    query Properties($filter: PropertyFilter, $sort: PropertySort, $limit: Int, $offset: Int) {
  properties(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
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
    `) as unknown as TypedDocumentString<PropertiesQuery, PropertiesQueryVariables>;
export const PropertyDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<PropertyQuery, PropertyQueryVariables>;