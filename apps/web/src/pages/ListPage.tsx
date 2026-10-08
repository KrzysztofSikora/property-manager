import { US_STATES } from '@property-manager/shared';
import { type SubmitEvent, useState } from 'react';
import { Link } from 'react-router';
import { type DeletableProperty, DeletePropertyDialog } from '../components/DeletePropertyDialog';
import type { PropertySort } from '../graphql/graphql';
import { type PropertiesFilter, useProperties } from '../hooks/useProperties';
import { formatDateTime } from '../lib/format';

const NO_FILTER: PropertiesFilter = { city: '', state: '', zipCode: '' };

const SORT_OPTIONS: { value: PropertySort; label: string }[] = [
  { value: 'CREATED_AT_DESC', label: 'Newest first' },
  { value: 'CREATED_AT_ASC', label: 'Oldest first' },
];

function isPropertySort(value: string): value is PropertySort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function ListPage() {
  // Filters apply on submit, sort on change. Kept in component state; URL state is #9.
  const [filter, setFilter] = useState<PropertiesFilter>(NO_FILTER);
  const [sort, setSort] = useState<PropertySort>('CREATED_AT_DESC');
  const properties = useProperties({ filter, sort });
  // The row whose Delete was clicked. The dialog is mounted (and open) only while it is set.
  const [toDelete, setToDelete] = useState<DeletableProperty | null>(null);

  function applyFilter(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFilter({
      city: formText(data, 'city'),
      state: formText(data, 'state'),
      zipCode: formText(data, 'zipCode'),
    });
  }

  const filtered = Object.values(filter).some((value) => value.trim() !== '');

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Properties</h1>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            City
            <input name="city" maxLength={100} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            State
            <select name="state" className="rounded border px-2 py-1">
              <option value="">All states</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} – {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Zip code
            <input
              name="zipCode"
              maxLength={5}
              inputMode="numeric"
              className="w-24 rounded border px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-gray-800 px-3 py-1 text-white">
            Apply
          </button>
        </form>

        <label className="flex flex-col text-sm">
          Sort
          <select
            value={sort}
            onChange={(event) => {
              if (isPropertySort(event.target.value)) setSort(event.target.value);
            }}
            className="rounded border px-2 py-1"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {properties.isPending ? (
        <p role="status">Loading properties…</p>
      ) : properties.isError ? (
        <div role="alert" className="flex items-center gap-3 text-red-700">
          <p>Could not load properties</p>
          <button
            type="button"
            onClick={() => void properties.refetch()}
            className="rounded border px-3 py-1"
          >
            Retry
          </button>
        </div>
      ) : properties.data.properties.items.length === 0 ? (
        <div>
          <p>{filtered ? 'No properties match the filters' : 'No properties yet'}</p>
          <Link to="/properties/new" className="text-blue-700 underline">
            Add a property
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-600">
            {properties.data.properties.totalCount === 1
              ? '1 property'
              : `${String(properties.data.properties.totalCount)} properties`}
            {properties.isPlaceholderData && <span role="status"> · Updating…</span>}
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Street</th>
                <th>City</th>
                <th>State</th>
                <th>Zip code</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {properties.data.properties.items.map((property) => (
                <tr key={property.id} className="border-b">
                  <td className="py-2">
                    <Link to={`/properties/${property.id}`} className="text-blue-700 underline">
                      {property.street}
                    </Link>
                  </td>
                  <td>{property.city}</td>
                  <td>{property.state}</td>
                  <td>{property.zipCode}</td>
                  <td>{formatDateTime(property.createdAt)}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${property.street}`}
                      onClick={() => {
                        setToDelete(property);
                      }}
                      className="rounded border px-2 py-0.5 text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {toDelete && (
        <DeletePropertyDialog
          property={toDelete}
          onClose={() => {
            setToDelete(null);
          }}
        />
      )}
    </>
  );
}
