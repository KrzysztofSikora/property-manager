CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"lat" double precision NOT NULL,
	"long" double precision NOT NULL,
	"weather_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_state_format" CHECK ("properties"."state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "properties_zip_code_format" CHECK ("properties"."zip_code" ~ '^[0-9]{5}$'),
	CONSTRAINT "properties_lat_range" CHECK ("properties"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "properties_long_range" CHECK ("properties"."long" BETWEEN -180 AND 180),
	CONSTRAINT "properties_weather_data_shape" CHECK (jsonb_typeof("properties"."weather_data") = 'object' AND "properties"."weather_data" ? 'units' AND "properties"."weather_data" ? 'current')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "properties_address_unique" ON "properties" USING btree (lower("street"),lower("city"),"state","zip_code");