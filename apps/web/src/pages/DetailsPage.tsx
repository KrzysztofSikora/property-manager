import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DeletePropertyDialog } from '../components/DeletePropertyDialog';
import { useProperty } from '../hooks/useProperty';
import { formatDateTime } from '../lib/format';

export function DetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const query = useProperty(id);
  const [deleting, setDeleting] = useState(false);

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
  const description = weather.weatherDescriptions[0];
  const icon = weather.weatherIcons[0];
  // The property is gone either way, so a delete and a "not found" both return to the list.
  const backToList = () => void navigate('/');

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
