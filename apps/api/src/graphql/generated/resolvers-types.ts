import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { GraphQLContext } from '../context.ts';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An RFC 3339 date-time string in UTC. */
  DateTime: { input: Date; output: Date | string; }
  /** Any JSON value. Used for the Weatherstack `current` object as it was received. */
  JSON: { input: unknown; output: unknown; }
};

/** Weatherstack `current.air_quality`. Pollutants are in µg/m³. */
export type AirQuality = {
  __typename?: 'AirQuality';
  co?: Maybe<Scalars['Float']['output']>;
  /** UK DEFRA index, 1 to 10. */
  gbDefraIndex?: Maybe<Scalars['Int']['output']>;
  no2?: Maybe<Scalars['Float']['output']>;
  o3?: Maybe<Scalars['Float']['output']>;
  pm2_5?: Maybe<Scalars['Float']['output']>;
  pm10?: Maybe<Scalars['Float']['output']>;
  so2?: Maybe<Scalars['Float']['output']>;
  /** US EPA index, 1 (Good) to 6 (Hazardous). */
  usEpaIndex?: Maybe<Scalars['Int']['output']>;
};

/** Weatherstack `current.astro`. Times are "hh:mm AM/PM", local to the location. */
export type Astro = {
  __typename?: 'Astro';
  /** Percent. */
  moonIllumination?: Maybe<Scalars['Int']['output']>;
  moonPhase?: Maybe<Scalars['String']['output']>;
  moonrise?: Maybe<Scalars['String']['output']>;
  moonset?: Maybe<Scalars['String']['output']>;
  sunrise?: Maybe<Scalars['String']['output']>;
  sunset?: Maybe<Scalars['String']['output']>;
};

/**
 * Weatherstack `current`, camelCased. The key fields are always set. Every other field is null
 * when Weatherstack did not send it or sent it with an unexpected type. `raw` holds the object as
 * it was received.
 */
export type CurrentWeather = {
  __typename?: 'CurrentWeather';
  airQuality?: Maybe<AirQuality>;
  astro?: Maybe<Astro>;
  /** Percent. */
  cloudCover?: Maybe<Scalars['Int']['output']>;
  feelsLike: Scalars['Int']['output'];
  humidity: Scalars['Int']['output'];
  isDay?: Maybe<Scalars['Boolean']['output']>;
  /** "hh:mm AM/PM" in UTC, without a date. */
  observationTime?: Maybe<Scalars['String']['output']>;
  /** Inches. */
  precip?: Maybe<Scalars['Float']['output']>;
  /** mb. */
  pressure?: Maybe<Scalars['Int']['output']>;
  /** The Weatherstack `current` object as it was received. */
  raw: Scalars['JSON']['output'];
  temperature: Scalars['Int']['output'];
  uvIndex?: Maybe<Scalars['Int']['output']>;
  /** Miles. */
  visibility?: Maybe<Scalars['Int']['output']>;
  weatherCode?: Maybe<Scalars['Int']['output']>;
  weatherDescriptions: Array<Scalars['String']['output']>;
  weatherIcons: Array<Scalars['String']['output']>;
  windDegree?: Maybe<Scalars['Int']['output']>;
  windDir: Scalars['String']['output'];
  windSpeed: Scalars['Int']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /**
   * Validates and normalizes the address, fetches the current weather once, and stores the
   * property. Errors: BAD_USER_INPUT, PROPERTY_ALREADY_EXISTS, WEATHER_UNAVAILABLE,
   * WEATHER_QUOTA_EXCEEDED, WEATHER_LOCATION_MISMATCH, INTERNAL_SERVER_ERROR.
   */
  createProperty?: Maybe<Property>;
  /**
   * Permanently deletes the property and returns its id. Errors: PROPERTY_NOT_FOUND (also for an
   * id that is not a UUID).
   */
  deleteProperty: Scalars['ID']['output'];
};


export type MutationCreatePropertyArgs = {
  city: Scalars['String']['input'];
  state: Scalars['String']['input'];
  street: Scalars['String']['input'];
  zipCode: Scalars['String']['input'];
};


export type MutationDeletePropertyArgs = {
  id: Scalars['ID']['input'];
};

export type Property = {
  __typename?: 'Property';
  city: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lat: Scalars['Float']['output'];
  long: Scalars['Float']['output'];
  /** Two-letter US state code (50 states or DC). */
  state: Scalars['String']['output'];
  street: Scalars['String']['output'];
  weatherData: WeatherData;
  /** Five digits, kept as a string so leading zeros survive. */
  zipCode: Scalars['String']['output'];
};

/**
 * Filters for `properties`. They combine with AND. A missing, null or blank value is ignored, and
 * each value may be at most 100 characters.
 */
export type PropertyFilter = {
  /** Case-insensitive contains match. `%`, `_` and `\` are matched literally. */
  city?: InputMaybe<Scalars['String']['input']>;
  /** Exact match on the two-letter code, case-insensitive. */
  state?: InputMaybe<Scalars['String']['input']>;
  /** Exact match on all five digits. */
  zipCode?: InputMaybe<Scalars['String']['input']>;
};

/** One page of a property list. */
export type PropertyPage = {
  __typename?: 'PropertyPage';
  items: Array<Property>;
  /** How many properties match the filter, across all pages. */
  totalCount: Scalars['Int']['output'];
};

/** The order of a property list. Ties on `createdAt` are broken by `id` in the same direction. */
export type PropertySort =
  /** Oldest first. */
  | 'CREATED_AT_ASC'
  /** Newest first. */
  | 'CREATED_AT_DESC';

export type Query = {
  __typename?: 'Query';
  /** Returns ok when the API is up. */
  health: Scalars['String']['output'];
  /**
   * Properties that match `filter`, sorted by `sort`. Without `limit` every match is returned.
   * `limit` must be 1-100 and `offset` 0 or greater. Errors: BAD_USER_INPUT.
   */
  properties: PropertyPage;
  /** The property with this id, or null when there is none or the id is not a UUID. */
  property?: Maybe<Property>;
};


export type QueryPropertiesArgs = {
  filter?: InputMaybe<PropertyFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<PropertySort>;
};


export type QueryPropertyArgs = {
  id: Scalars['ID']['input'];
};

/** The weather snapshot taken when the property was created. */
export type WeatherData = {
  __typename?: 'WeatherData';
  current: CurrentWeather;
  units: WeatherUnits;
};

export type WeatherUnits =
  | 'IMPERIAL';



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AirQuality: ResolverTypeWrapper<AirQuality>;
  Astro: ResolverTypeWrapper<Astro>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CurrentWeather: ResolverTypeWrapper<CurrentWeather>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Property: ResolverTypeWrapper<Property>;
  PropertyFilter: PropertyFilter;
  PropertyPage: ResolverTypeWrapper<PropertyPage>;
  PropertySort: PropertySort;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  WeatherData: ResolverTypeWrapper<WeatherData>;
  WeatherUnits: WeatherUnits;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AirQuality: AirQuality;
  Astro: Astro;
  Boolean: Scalars['Boolean']['output'];
  CurrentWeather: CurrentWeather;
  DateTime: Scalars['DateTime']['output'];
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: Record<PropertyKey, never>;
  Property: Property;
  PropertyFilter: PropertyFilter;
  PropertyPage: PropertyPage;
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  WeatherData: WeatherData;
};

export type AirQualityResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AirQuality'] = ResolversParentTypes['AirQuality']> = {
  co?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  gbDefraIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  no2?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  o3?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  pm2_5?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  pm10?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  so2?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  usEpaIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type AstroResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Astro'] = ResolversParentTypes['Astro']> = {
  moonIllumination?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  moonPhase?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  moonrise?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  moonset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sunrise?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sunset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type CurrentWeatherResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CurrentWeather'] = ResolversParentTypes['CurrentWeather']> = {
  airQuality?: Resolver<Maybe<ResolversTypes['AirQuality']>, ParentType, ContextType>;
  astro?: Resolver<Maybe<ResolversTypes['Astro']>, ParentType, ContextType>;
  cloudCover?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  feelsLike?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  humidity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isDay?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  observationTime?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  precip?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  pressure?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  raw?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  temperature?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  uvIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  visibility?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  weatherCode?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  weatherDescriptions?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  weatherIcons?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  windDegree?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  windDir?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  windSpeed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createProperty?: Resolver<Maybe<ResolversTypes['Property']>, ParentType, ContextType, RequireFields<MutationCreatePropertyArgs, 'city' | 'state' | 'street' | 'zipCode'>>;
  deleteProperty?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeletePropertyArgs, 'id'>>;
};

export type PropertyResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Property'] = ResolversParentTypes['Property']> = {
  city?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lat?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  long?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  street?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  weatherData?: Resolver<ResolversTypes['WeatherData'], ParentType, ContextType>;
  zipCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PropertyPageResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PropertyPage'] = ResolversParentTypes['PropertyPage']> = {
  items?: Resolver<Array<ResolversTypes['Property']>, ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  health?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  properties?: Resolver<ResolversTypes['PropertyPage'], ParentType, ContextType, RequireFields<QueryPropertiesArgs, 'offset' | 'sort'>>;
  property?: Resolver<Maybe<ResolversTypes['Property']>, ParentType, ContextType, RequireFields<QueryPropertyArgs, 'id'>>;
};

export type WeatherDataResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['WeatherData'] = ResolversParentTypes['WeatherData']> = {
  current?: Resolver<ResolversTypes['CurrentWeather'], ParentType, ContextType>;
  units?: Resolver<ResolversTypes['WeatherUnits'], ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQLContext> = {
  AirQuality?: AirQualityResolvers<ContextType>;
  Astro?: AstroResolvers<ContextType>;
  CurrentWeather?: CurrentWeatherResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  Property?: PropertyResolvers<ContextType>;
  PropertyPage?: PropertyPageResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  WeatherData?: WeatherDataResolvers<ContextType>;
};

