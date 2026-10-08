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

export type DeletePropertyMutationVariables = Exact<{
  id: string | number;
}>;


export type DeletePropertyMutation = { deleteProperty: string };

export type PropertiesQueryVariables = Exact<{
  filter?: PropertyFilter | null | undefined;
  sort?: PropertySort | null | undefined;
}>;


export type PropertiesQuery = { properties: { totalCount: number, items: Array<{ id: string, street: string, city: string, state: string, zipCode: string, createdAt: string }> } };

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

export const DeletePropertyDocument = new TypedDocumentString(`
    mutation DeleteProperty($id: ID!) {
  deleteProperty(id: $id)
}
    `) as unknown as TypedDocumentString<DeletePropertyMutation, DeletePropertyMutationVariables>;
export const PropertiesDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<PropertiesQuery, PropertiesQueryVariables>;