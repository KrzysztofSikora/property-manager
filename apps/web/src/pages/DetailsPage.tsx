import { useQueryClient } from '@tanstack/react-query';
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DeletePropertyDialog } from '../components/DeletePropertyDialog';
import { TrashIcon } from '../components/icons';
import { useProperty } from '../hooks/useProperty';
import { type EpaIndexTone, epaIndexLabel, epaIndexTone, formatDateTime } from '../lib/format';

// A label and its display text, or `null` when the API sent no value.
type Row = [label: string, value: string | null];

// `0` is a value, so only `null` leaves the row out.
function withUnit(value: number | null, unit: string): string | null {
  return value === null ? null : `${String(value)} ${unit}`;
}

function plain(value: number | null): string | null {
  return value === null ? null : String(value);
}

function present(rows: Row[]): [string, string][] {
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

const CARD = 'rounded-card border border-line bg-surface';
const GHOST_BUTTON =
  'inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 font-semibold whitespace-nowrap hover:bg-ground';
const STATE_CHIP =
  'inline-block rounded-[5px] bg-accent-soft px-[7px] py-px font-mono text-[12.5px] font-medium text-accent';
const EPA_BADGE: Record<EpaIndexTone, string> = {
  good: 'bg-good-soft text-good',
  fair: 'bg-fair-soft text-fair',
  poor: 'bg-danger-soft text-danger',
  neutral: 'bg-ground text-muted',
};

// One weather card: an `h2`, optional badge and extra content, and its own `<dl>`. Rows without
// a value are dropped, and the card is left out when nothing is left to show (FR-12 AC5, AC6).
function DetailsCard({
  title,
  rows,
  badge,
  children,
}: {
  title: string;
  rows: Row[];
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const headingId = useId();
  const shown = present(rows);
  if (shown.length === 0 && !badge) return null;
  return (
    <section aria-labelledby={headingId} className={`${CARD} grid gap-3 px-5 py-[18px]`}>
      {/* The badge sits beside the heading, not in it, so the heading text stays the title. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[15px] font-semibold">
          {title}
        </h2>
        {badge}
      </div>
      {children}
      {shown.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3.5 gap-y-[7px] text-[14.5px]">
          {shown.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="min-w-0 text-right font-mono text-[13.5px]">{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
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

  if (query.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading property…
      </p>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-control bg-danger-soft px-4 py-3 text-danger"
      >
        <p>Could not load the property</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className={`${GHOST_BUTTON} text-ink`}
        >
          Retry
        </button>
      </div>
    );
  }

  const property = query.data.property;
  if (!property) {
    return (
      <section className={`${CARD} grid justify-items-start gap-3 p-6`}>
        <h1 className="text-[26px] font-bold tracking-tight">Property not found</h1>
        <Link to="/" className={GHOST_BUTTON}>
          Back to properties
        </Link>
      </section>
    );
  }

  const weather = property.weatherData.current;
  const { astro, airQuality } = weather;
  const pollutant = (value: number | null | undefined) => withUnit(value ?? null, 'µg/m³');
  const epaIndex = airQuality?.usEpaIndex ?? null;
  const description = weather.weatherDescriptions[0];
  const icon = weather.weatherIcons[0];
  // Weatherstack sends the observation time in UTC, without a date.
  const observed = weather.observationTime === null ? null : `${weather.observationTime} UTC`;
  const sunrise = astro?.sunrise ?? null;
  const sunset = astro?.sunset ?? null;
  const tiles = present([
    ['Wind', `${String(weather.windSpeed)} mph ${weather.windDir}`],
    ['Humidity', withUnit(weather.humidity, '%')],
    ['Cloud cover', withUnit(weather.cloudCover, '%')],
    ['UV index', plain(weather.uvIndex)],
    ['Pressure', withUnit(weather.pressure, 'mb')],
    ['Visibility', withUnit(weather.visibility, 'mi')],
  ]);
  // The property is gone either way, so a delete and a "not found" both return to the list.
  const backToList = () => {
    gone.current = true;
    void navigate('/');
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-[13.5px] text-muted">
            <Link to="/" className="text-accent no-underline hover:underline">
              Properties
            </Link>{' '}
            / {property.city}, {property.state}
          </nav>
          <h1 className="text-[26px] font-bold tracking-tight">{property.street}</h1>
          <p className="mt-0.5 text-muted">
            {property.city}, {property.state} {property.zipCode} · created{' '}
            {formatDateTime(property.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleting(true);
          }}
          className={`${GHOST_BUTTON} text-danger hover:bg-danger-soft`}
        >
          <TrashIcon className="size-4" />
          Delete
        </button>
      </div>

      <div className={`${CARD} grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]`}>
        <section
          aria-label="Current weather"
          className="grid gap-[18px] border-b border-line p-6 md:border-r md:border-b-0"
        >
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
            {icon !== undefined && (
              <img src={icon} alt={description ?? 'Weather icon'} className="size-16 rounded-lg" />
            )}
            {/* The space sits inside the unit span, so the element's text is "82 °F". */}
            <div className="text-[46px] leading-none font-semibold tracking-[-.03em] tabular-nums sm:text-[56px]">
              {weather.temperature}
              <span className="relative top-1.5 ml-0.5 align-top text-[22px] font-medium text-muted">
                {' °F'}
              </span>
            </div>
            <div>
              {description !== undefined && (
                <div className="text-lg font-semibold">{description}</div>
              )}
              <div className="text-sm text-muted">
                {`Feels like ${String(weather.feelsLike)} °F`}
                {observed !== null && ` · observed ${observed}`}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-control bg-ground px-3 py-2.5">
                <dt className="text-xs font-semibold tracking-[.06em] text-muted uppercase">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <LocationPanel
          street={property.street}
          city={property.city}
          state={property.state}
          zipCode={property.zipCode}
          lat={property.lat}
          long={property.long}
        />
      </div>

      <div className="grid items-start gap-4 md:grid-cols-3">
        <DetailsCard
          title="Air quality"
          rows={[
            ['PM2.5', pollutant(airQuality?.pm2_5)],
            ['PM10', pollutant(airQuality?.pm10)],
            ['O₃', pollutant(airQuality?.o3)],
            ['NO₂', pollutant(airQuality?.no2)],
            ['SO₂', pollutant(airQuality?.so2)],
            ['CO', pollutant(airQuality?.co)],
            ['GB DEFRA index', plain(airQuality?.gbDefraIndex ?? null)],
          ]}
          badge={
            epaIndex !== null && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-[9px] py-0.5 text-[12.5px] font-semibold before:size-[7px] before:rounded-full before:bg-current before:content-[''] ${EPA_BADGE[epaIndexTone(epaIndex)]}`}
              >
                {`US EPA ${epaIndexLabel(epaIndex)}`}
              </span>
            )
          }
        />
        <DetailsCard
          title="Sun and moon"
          rows={[
            ['Sunrise', sunrise],
            ['Sunset', sunset],
            ['Moonrise', astro?.moonrise ?? null],
            ['Moonset', astro?.moonset ?? null],
            ['Moon phase', astro?.moonPhase ?? null],
            ['Illumination', withUnit(astro?.moonIllumination ?? null, '%')],
          ]}
        >
          {sunrise !== null && sunset !== null && (
            <div
              aria-hidden="true"
              className="grid grid-cols-[max-content_1fr_max-content] items-center gap-2.5 font-mono text-[13px]"
            >
              <span>{sunrise}</span>
              <span className="h-1.5 rounded-[3px] bg-linear-to-r from-line via-sun to-line" />
              <span>{sunset}</span>
            </div>
          )}
        </DetailsCard>
        <DetailsCard
          title="Precipitation"
          rows={[
            ['Precipitation', withUnit(weather.precip, 'in')],
            ['Cloud cover', withUnit(weather.cloudCover, '%')],
            ['Observed', observed],
          ]}
        />
      </div>

      {/* Outside every card, so it shows even when a card is left out (FR-12 AC2, AC5). */}
      <p className="text-[13px] text-muted">
        Weather is as of when the property was created. It is not refreshed.
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

// Address and coordinates, with the note that the coordinates are town-level (FR-12 AC1, AC2).
function LocationPanel(props: {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  long: number;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid content-start gap-3.5 p-6">
      <h2 id={headingId} className="text-[15px] font-semibold">
        Location
      </h2>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-[18px] gap-y-2 tabular-nums">
        <dt className="text-sm text-muted">Street</dt>
        <dd className="min-w-0">{props.street}</dd>
        <dt className="text-sm text-muted">City</dt>
        <dd className="min-w-0">{props.city}</dd>
        <dt className="text-sm text-muted">State</dt>
        <dd>
          <span className={STATE_CHIP}>{props.state}</span>
        </dd>
        <dt className="text-sm text-muted">Zip code</dt>
        <dd className="font-mono text-[13.5px]">{props.zipCode}</dd>
        <dt className="text-sm text-muted">Latitude</dt>
        <dd className="font-mono text-[13.5px]">{props.lat}</dd>
        <dt className="text-sm text-muted">Longitude</dt>
        <dd className="font-mono text-[13.5px]">{props.long}</dd>
      </dl>
      <p className="rounded-control border border-dashed border-line px-3 py-2.5 text-[13px] text-muted">
        Coordinates are those of the town Weatherstack resolved the address to, not of the building.
      </p>
    </section>
  );
}
