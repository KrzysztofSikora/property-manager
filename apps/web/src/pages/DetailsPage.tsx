import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DeletePropertyDialog } from '../components/DeletePropertyDialog';
import { useProperty } from '../hooks/useProperty';
import { epaIndexLabel, formatDateTime } from '../lib/format';

// A label and its display text, or `null` when the API sent no value.
type Row = [label: string, value: string | null];

// `0` is a value, so only `null` leaves the row out.
function withUnit(value: number | null, unit: string): string | null {
  return value === null ? null : `${String(value)} ${unit}`;
}

function plain(value: number | null): string | null {
  return value === null ? null : String(value);
}

// One extra weather group: an `h2` and its own `<dl>`, left out when no row has a value
// (FR-12 AC5, AC6).
function DetailsGroup({ title, rows }: { title: string; rows: Row[] }) {
  const headingId = useId();
  const shown = rows.filter((row): row is [string, string] => row[1] !== null);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        {shown.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function DetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const query = useProperty(id);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const gone = useRef(false);

  // The delete leaves this page's own entry cached so it does not re-fetch into "not found"
  // before leaving. Once the page has left, the entry goes too, so Back does not show the
  // deleted property from cache.
  useEffect(
    () => () => {
      if (gone.current) {
        queryClient.removeQueries({ queryKey: ['properties', 'detail', id], exact: true });
      }
    },
    [queryClient, id],
  );

  if (query.isPending) return <p role="status">Loading property…</p>;

  if (query.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 text-red-700">
        <p>Could not load the property</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded border px-3 py-1"
        >
          Retry
        </button>
      </div>
    );
  }

  const property = query.data.property;
  if (!property) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Property not found</h1>
        <Link to="/" className="text-blue-700 underline">
          Back to properties
        </Link>
      </>
    );
  }

  const weather = property.weatherData.current;
  const { astro, airQuality } = weather;
  const pollutant = (value: number | null | undefined) => withUnit(value ?? null, 'µg/m³');
  const epaIndex = airQuality?.usEpaIndex ?? null;
  const description = weather.weatherDescriptions[0];
  const icon = weather.weatherIcons[0];
  // The property is gone either way, so a delete and a "not found" both return to the list.
  const backToList = () => {
    gone.current = true;
    void navigate('/');
  };

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{property.street}</h1>
        <button
          type="button"
          onClick={() => {
            setDeleting(true);
          }}
          className="rounded border px-3 py-1 text-red-700"
        >
          Delete
        </button>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        <dt className="font-semibold">Address</dt>
        <dd>
          {property.street}, {property.city}, {property.state} {property.zipCode}
        </dd>
        <dt className="font-semibold">Coordinates</dt>
        <dd>
          {property.lat}, {property.long}
        </dd>
        <dt className="font-semibold">Created</dt>
        <dd>{formatDateTime(property.createdAt)}</dd>
        <dt className="font-semibold">Temperature</dt>
        <dd>{weather.temperature} °F</dd>
        <dt className="font-semibold">Feels like</dt>
        <dd>{weather.feelsLike} °F</dd>
        {(description !== undefined || icon !== undefined) && (
          <>
            <dt className="font-semibold">Conditions</dt>
            <dd className="flex items-center gap-2">
              {icon !== undefined && (
                <img src={icon} alt={description ?? 'Weather icon'} className="h-8 w-8" />
              )}
              {description}
            </dd>
          </>
        )}
        <dt className="font-semibold">Wind</dt>
        <dd>
          {weather.windSpeed} mph {weather.windDir}
        </dd>
        <dt className="font-semibold">Humidity</dt>
        <dd>{weather.humidity} %</dd>
      </dl>

      <DetailsGroup
        title="Weather details"
        rows={[
          // Weatherstack sends the observation time in UTC, without a date.
          ['Observed', weather.observationTime === null ? null : `${weather.observationTime} UTC`],
          ['Pressure', withUnit(weather.pressure, 'mb')],
          ['Precipitation', withUnit(weather.precip, 'in')],
          ['Cloud cover', withUnit(weather.cloudCover, '%')],
          ['UV index', plain(weather.uvIndex)],
          ['Visibility', withUnit(weather.visibility, 'mi')],
        ]}
      />
      <DetailsGroup
        title="Astronomy"
        rows={[
          ['Sunrise', astro?.sunrise ?? null],
          ['Sunset', astro?.sunset ?? null],
          ['Moonrise', astro?.moonrise ?? null],
          ['Moonset', astro?.moonset ?? null],
          ['Moon phase', astro?.moonPhase ?? null],
          ['Moon illumination', withUnit(astro?.moonIllumination ?? null, '%')],
        ]}
      />
      <DetailsGroup
        title="Air quality"
        rows={[
          ['CO', pollutant(airQuality?.co)],
          ['NO₂', pollutant(airQuality?.no2)],
          ['O₃', pollutant(airQuality?.o3)],
          ['SO₂', pollutant(airQuality?.so2)],
          ['PM2.5', pollutant(airQuality?.pm2_5)],
          ['PM10', pollutant(airQuality?.pm10)],
          ['US EPA index', epaIndex === null ? null : epaIndexLabel(epaIndex)],
          ['GB DEFRA index', plain(airQuality?.gbDefraIndex ?? null)],
        ]}
      />

      <p className="mt-4 text-sm text-gray-600">
        Coordinates are those of the town Weatherstack resolved the address to, not of the building.
        Weather is as of when the property was created.
      </p>

      {deleting && (
        <DeletePropertyDialog
          property={property}
          onClose={() => {
            setDeleting(false);
          }}
          onDeleted={backToList}
          onNotFound={backToList}
        />
      )}
    </>
  );
}
