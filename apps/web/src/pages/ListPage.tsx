import { US_STATES } from '@property-manager/shared';
import { type SubmitEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type DeletableProperty, DeletePropertyDialog } from '../components/DeletePropertyDialog';
import { TrashIcon } from '../components/icons';
import type { PropertySort } from '../graphql/graphql';
import { PAGE_SIZE, useProperties } from '../hooks/useProperties';
import { formatDateTime } from '../lib/format';
import { parseListSearch, toListSearch } from '../lib/list-search';

const SORT_OPTIONS: { value: PropertySort; label: string }[] = [
  { value: 'CREATED_AT_DESC', label: 'Newest first' },
  { value: 'CREATED_AT_ASC', label: 'Oldest first' },
];

function isPropertySort(value: string): value is PropertySort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

const FIELD = 'grid min-w-0 gap-1';
const FIELD_LABEL = 'text-xs font-semibold tracking-[.06em] text-muted uppercase';
const CONTROL = 'h-[38px] w-full rounded-control border border-line bg-surface px-2.5';
const GHOST_BUTTON =
  'inline-flex items-center rounded-control border border-line bg-surface px-3.5 py-2 font-semibold text-ink hover:bg-ground';
const PAGER_BUTTON =
  'rounded-control border border-line bg-surface px-2.5 py-1 font-medium text-ink disabled:opacity-45 aria-disabled:opacity-45';
const TH =
  'border-b border-line px-3 py-2.5 text-xs font-semibold tracking-[.06em] whitespace-nowrap text-muted uppercase sm:px-4';
const TD_BASE = 'px-3 py-3 align-middle sm:px-4';
const TD = `${TD_BASE} whitespace-nowrap`;

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function ListPage() {
  // Filters apply on submit, sort on change. They and the page live in the URL, so reload and
  // Back keep them. A filter or sort change leaves `page` out, which goes back to page 1.
  const [searchParams, setSearchParams] = useSearchParams();
  const { filter, sort, page } = parseListSearch(searchParams);
  const properties = useProperties({ filter, sort, page });
  const totalCount = properties.data?.properties.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // The row whose Delete was clicked. The dialog is mounted (and open) only while it is set.
  const [toDelete, setToDelete] = useState<DeletableProperty | null>(null);

  function applyFilter(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = toListSearch({
      filter: {
        city: formText(data, 'city'),
        state: formText(data, 'state'),
        zipCode: formText(data, 'zipCode'),
      },
      sort,
    });
    // Unchanged filters would push a duplicate history entry, so Back would seem to do nothing.
    // Compare canonical forms without the page: a hand-edited link may order its keys
    // differently, and an unchanged Apply keeps the page.
    const current = toListSearch({ filter, sort });
    if (next.toString() !== current.toString()) setSearchParams(next);
  }

  // A page past the end (an old link, or the last row of the last page deleted) moves to the
  // last page. Placeholder data belongs to the previous page, so it is not checked.
  const pastTheEnd = properties.isSuccess && !properties.isPlaceholderData && page > pageCount;
  useEffect(() => {
    if (pastTheEnd) {
      setSearchParams(toListSearch({ filter, sort, page: pageCount }), { replace: true });
    }
  }, [pastTheEnd, filter, sort, pageCount, setSearchParams]);

  function goToPage(next: number) {
    setSearchParams(toListSearch({ filter, sort, page: next }));
  }

  const filtered = Object.values(filter).some((value) => value.trim() !== '');

  const count = (
    <span>
      {totalCount === 1 ? '1 property' : `${String(totalCount)} properties`}
      {properties.isPlaceholderData && <span role="status"> · Updating…</span>}
    </span>
  );

  return (
    <>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Properties</h1>
        <p className="mt-0.5 text-muted">
          {properties.isSuccess && properties.data.properties.items.length > 0 && <>{count} · </>}
          Weather is the snapshot taken when each one was created.
        </p>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3.5">
          {/* Keyed by the applied filters, so Back refills the inputs. A sort change keeps
              text typed but not applied. */}
          <form
            key={toListSearch({ filter, sort: 'CREATED_AT_DESC' }).toString()}
            onSubmit={applyFilter}
            className="flex min-w-0 flex-[1_1_480px] flex-wrap items-end gap-3"
          >
            <label className={`${FIELD} flex-[2_1_180px]`}>
              <span className={FIELD_LABEL}>City</span>
              <input name="city" maxLength={100} defaultValue={filter.city} className={CONTROL} />
            </label>
            <label className={`${FIELD} flex-[1.4_1_150px]`}>
              <span className={FIELD_LABEL}>State</span>
              <select name="state" defaultValue={filter.state} className={CONTROL}>
                <option value="">All states</option>
                {Object.entries(US_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} – {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${FIELD} flex-[1_1_100px]`}>
              <span className={FIELD_LABEL}>Zip code</span>
              <input
                name="zipCode"
                maxLength={5}
                defaultValue={filter.zipCode}
                inputMode="numeric"
                className={`${CONTROL} font-mono`}
              />
            </label>
            <button type="submit" className={`${GHOST_BUTTON} h-[38px]`}>
              Apply
            </button>
          </form>

          <label className={`${FIELD} flex-[0_1_160px] md:ml-auto`}>
            <span className={FIELD_LABEL}>Sort</span>
            <select
              value={sort}
              onChange={(event) => {
                if (isPropertySort(event.target.value)) {
                  setSearchParams(toListSearch({ filter, sort: event.target.value }));
                }
              }}
              className={CONTROL}
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
          <p role="status" className="px-4 py-8 text-center text-muted">
            Loading properties…
          </p>
        ) : properties.isError ? (
          <div
            role="alert"
            className="m-4 flex flex-wrap items-center gap-3 rounded-control bg-danger-soft px-4 py-3 text-danger"
          >
            <p>Could not load properties</p>
            <button
              type="button"
              onClick={() => void properties.refetch()}
              className={GHOST_BUTTON}
            >
              Retry
            </button>
          </div>
        ) : properties.data.properties.items.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-4 py-10 text-center">
            <p className="text-muted">
              {filtered ? 'No properties match the filters' : 'No properties yet'}
            </p>
            <Link
              to="/properties/new"
              className="rounded-control bg-accent px-3.5 py-2 font-semibold text-white hover:bg-accent/90"
            >
              Add a property
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left tabular-nums">
                <thead>
                  <tr>
                    <th className={TH}>Address</th>
                    <th className={TH}>State</th>
                    <th className={TH}>Zip code</th>
                    <th className={`${TH} hidden sm:table-cell`}>Weather at creation</th>
                    <th className={`${TH} hidden sm:table-cell`}>Created</th>
                    <th className={TH}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {properties.data.properties.items.map((property) => {
                    const { temperature, weatherDescriptions, weatherIcons } =
                      property.weatherData.current;
                    const created = formatDateTime(property.createdAt);
                    return (
                      <tr
                        key={property.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-ground"
                      >
                        <td className={`${TD_BASE} sm:whitespace-nowrap`}>
                          <Link
                            to={`/properties/${property.id}`}
                            className="font-semibold text-ink no-underline hover:text-accent hover:underline"
                          >
                            {property.street}
                          </Link>
                          <small className="block text-[13px] text-muted">{property.city}</small>
                          <small className="block text-[13px] text-muted sm:hidden">
                            {created}
                          </small>
                        </td>
                        <td className={TD}>
                          <span className="inline-block rounded-[5px] bg-accent-soft px-[7px] py-px font-mono text-[12.5px] font-medium text-accent">
                            {property.state}
                          </span>
                        </td>
                        <td className={`${TD} font-mono text-[13.5px]`}>{property.zipCode}</td>
                        <td className={`${TD} hidden sm:table-cell`}>
                          <span className="inline-flex items-center gap-2">
                            {weatherIcons[0] && (
                              <img src={weatherIcons[0]} alt="" className="size-[22px] rounded" />
                            )}
                            <b className="font-semibold">{temperature} °F</b>
                            {weatherDescriptions[0] && (
                              <span className="text-[13px] text-muted">
                                {weatherDescriptions[0]}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={`${TD} hidden text-muted sm:table-cell`}>{created}</td>
                        <td className={`${TD} text-right`}>
                          <button
                            type="button"
                            aria-label={`Delete ${property.street}`}
                            title="Delete"
                            onClick={() => {
                              setToDelete(property);
                            }}
                            className="inline-grid size-8 place-items-center rounded-[7px] text-muted hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger"
                          >
                            <TrashIcon className="size-[17px]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalCount > PAGE_SIZE && (
              <nav
                aria-label="Pagination"
                className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-4 py-3 text-[13.5px] text-muted"
              >
                <button
                  type="button"
                  disabled={page === 1}
                  aria-disabled={properties.isPlaceholderData}
                  onClick={() => {
                    if (!properties.isPlaceholderData) goToPage(page - 1);
                  }}
                  className={PAGER_BUTTON}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  aria-disabled={properties.isPlaceholderData}
                  onClick={() => {
                    if (!properties.isPlaceholderData) goToPage(page + 1);
                  }}
                  className={PAGER_BUTTON}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>

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
