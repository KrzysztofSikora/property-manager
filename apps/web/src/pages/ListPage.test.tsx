import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { DeletePropertyMutationVariables, PropertiesQueryVariables } from '../graphql/graphql';
import { listItem, type PropertyListItem } from '../test/fixtures';
import { api, server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { ListPage } from './ListPage';

const newest = listItem({
  id: 'id-3',
  street: '3 Newest St',
  city: 'Fountain Hills',
  state: 'AZ',
  zipCode: '85268',
  createdAt: '2026-09-16T08:05:00.000Z',
});
const middle = listItem({
  id: 'id-2',
  street: '2 Middle Ave',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
  createdAt: '2026-09-15T12:30:00.000Z',
});
const oldest = listItem({
  id: 'id-1',
  street: '1 Oldest Rd',
  city: 'Boston',
  state: 'MA',
  zipCode: '02108',
  createdAt: '2026-09-14T23:42:00.000Z',
});

function propertiesPayload(items: PropertyListItem[], totalCount = items.length) {
  return { data: { properties: { items, totalCount } } };
}

// `count` rows numbered from 1, in list order.
function pagedItems(count: number) {
  return Array.from({ length: count }, (_, index) =>
    listItem({ id: `id-p${String(index + 1)}`, street: `${String(index + 1)} Paged St` }),
  );
}

// The streets of rows `from` to `to` of `pagedItems`.
function pagedStreets(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => `${String(from + index)} Paged St`);
}

// The page that `limit` / `offset` ask for, as the API serves it.
function pageOf(items: PropertyListItem[], { limit, offset }: PropertiesQueryVariables) {
  const start = offset ?? 0;
  return items.slice(start, limit == null ? undefined : start + limit);
}

// Serves `respond(variables)` and records the variables of every `Properties` request.
function serveProperties(respond: (variables: PropertiesQueryVariables) => PropertyListItem[]) {
  const requests: PropertiesQueryVariables[] = [];
  server.use(
    api.query<object, PropertiesQueryVariables>('Properties', ({ variables }) => {
      requests.push(variables);
      return HttpResponse.json(propertiesPayload(respond(variables)));
    }),
  );
  return requests;
}

// A stored list that `DeleteProperty` changes: `Properties` serves the requested page of what is
// left with the full count, and both operations are recorded.
function serveStore(
  initial: PropertyListItem[],
  respondDelete: (id: string, remove: () => void) => Response = (id, remove) => {
    remove();
    return HttpResponse.json({ data: { deleteProperty: id } });
  },
) {
  let items = initial;
  const listRequests: PropertiesQueryVariables[] = [];
  const deletedIds: string[] = [];
  server.use(
    api.query<object, PropertiesQueryVariables>('Properties', ({ variables }) => {
      listRequests.push(variables);
      return HttpResponse.json(propertiesPayload(pageOf(items, variables), items.length));
    }),
    api.mutation<object, DeletePropertyMutationVariables>('DeleteProperty', ({ variables }) => {
      // Codegen types an `ID` input as `string | number`. The app sends strings.
      const id = String(variables.id);
      deletedIds.push(id);
      return respondDelete(id, () => {
        items = items.filter((item) => item.id !== id);
      });
    }),
  );
  return { listRequests, deletedIds };
}

function notFoundResponse() {
  return HttpResponse.json({
    data: null,
    errors: [
      { message: 'No property with this id exists.', extensions: { code: 'PROPERTY_NOT_FOUND' } },
    ],
  });
}

async function openDeleteDialog(street: string) {
  const user = userEvent.setup();
  renderWithProviders(<ListPage />);
  await user.click(await screen.findByRole('button', { name: `Delete ${street}` }));
  const dialog = screen.getByRole('dialog', { name: 'Delete property?' });
  return { user, dialog };
}

// Shows the router's query string and goes Back, as the browser would.
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="URL search">{location.search}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

function renderListWithProbe(route = '/', initialEntries: string[] = []) {
  renderWithProviders(
    <>
      <ListPage />
      <RouterProbe />
    </>,
    { route, initialEntries },
  );
}

function pagination() {
  return screen.queryByRole('navigation', { name: 'Pagination' });
}

function urlSearch() {
  return screen.getByRole('status', { name: 'URL search' }).textContent;
}

// The street of each body row, top to bottom.
function rowStreets() {
  const [, ...rows] = screen.getAllByRole('row');
  return rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent);
}

describe('ListPage', () => {
  it('FR-11 AC1: lists every property newest first with address and creation date', async () => {
    const requests = serveProperties(() => [newest, middle, oldest]);

    renderWithProviders(<ListPage />);

    expect(await screen.findByRole('link', { name: '3 Newest St' })).toBeInTheDocument();
    expect(rowStreets()).toEqual(['3 Newest St', '2 Middle Ave', '1 Oldest Rd']);
    const cells = within(screen.getAllByRole('row')[3] as HTMLElement)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual([
      '1 Oldest Rd',
      'Boston',
      'MA',
      '02108',
      'Sep 14, 2026, 11:42 PM',
      'Delete',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Zip code' })).toBeInTheDocument();
    expect(screen.getByText('3 properties')).toBeInTheDocument();
    expect(requests).toEqual([{ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 }]);
    expect(pagination()).not.toBeInTheDocument();
  });

  it('FR-11 AC2: "Oldest first" re-fetches with CREATED_AT_ASC and re-orders the rows', async () => {
    const requests = serveProperties(({ sort }) =>
      sort === 'CREATED_AT_ASC' ? [oldest, middle, newest] : [newest, middle, oldest],
    );
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '3 Newest St' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Oldest first');

    await expect.poll(rowStreets).toEqual(['1 Oldest Rd', '2 Middle Ave', '3 Newest St']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Newest first');

    await expect.poll(rowStreets).toEqual(['3 Newest St', '2 Middle Ave', '1 Oldest Rd']);
    expect(requests.map((variables) => variables.sort)).toEqual([
      'CREATED_AT_DESC',
      'CREATED_AT_ASC',
      'CREATED_AT_DESC',
    ]);
  });

  it('FR-11 AC2: while a new sort loads, the old rows stay and an "Updating…" status shows', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      api.query<object, PropertiesQueryVariables>('Properties', async ({ variables }) => {
        if (variables.sort === 'CREATED_AT_ASC') {
          await held;
          return HttpResponse.json(propertiesPayload([oldest, middle, newest]));
        }
        return HttpResponse.json(propertiesPayload([newest, middle, oldest]));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '3 Newest St' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Oldest first');

    expect(await screen.findByRole('status')).toHaveTextContent('Updating…');
    expect(rowStreets()).toEqual(['3 Newest St', '2 Middle Ave', '1 Oldest Rd']);
    release();
    await expect.poll(rowStreets).toEqual(['1 Oldest Rd', '2 Middle Ave', '3 Newest St']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('FR-11 AC3: Apply sends the filled filters, leaves blank ones out and shows the matches', async () => {
    const requests = serveProperties(({ filter }) =>
      filter?.city ? [newest] : [newest, middle, oldest],
    );
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '2 Middle Ave' });

    await user.type(screen.getByRole('textbox', { name: 'City' }), '  fountain ');
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'AZ – Arizona');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await expect.poll(rowStreets).toEqual(['3 Newest St']);
    expect(requests).toEqual([
      { filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 },
      { filter: { city: 'fountain', state: 'AZ' }, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 },
    ]);
  });

  it('FR-11 AC3: the zip filter is sent on Enter, and typing alone sends nothing', async () => {
    const requests = serveProperties(() => [oldest]);
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '1 Oldest Rd' });

    await user.type(screen.getByRole('textbox', { name: 'Zip code' }), '02108');
    expect(requests).toHaveLength(1);
    await user.keyboard('{Enter}');

    await expect.poll(() => requests).toHaveLength(2);
    expect(requests[1]).toEqual({
      filter: { zipCode: '02108' },
      sort: 'CREATED_AT_DESC',
      limit: 20,
      offset: 0,
    });
  });

  it('FR-11 AC3a: Apply writes the filters to the URL, and a sort change adds sort=asc and keeps them', async () => {
    serveProperties(() => [newest]);
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByRole('link', { name: '3 Newest St' });

    await user.type(screen.getByRole('textbox', { name: 'City' }), ' Fountain Hills ');
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'AZ – Arizona');
    await user.type(screen.getByRole('textbox', { name: 'Zip code' }), '85268');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(urlSearch()).toBe('?city=Fountain+Hills&state=AZ&zip=85268');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Oldest first');

    expect(urlSearch()).toBe('?city=Fountain+Hills&state=AZ&zip=85268&sort=asc');
  });

  it('FR-11 AC3a: opening a URL with filters and sort fills the inputs and sends them in the first request', async () => {
    const requests = serveProperties(() => [newest]);

    renderListWithProbe('/?city=fountain&state=AZ&zip=85268&sort=asc');

    expect(await screen.findByRole('link', { name: '3 Newest St' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('fountain');
    expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('AZ');
    expect(screen.getByRole('textbox', { name: 'Zip code' })).toHaveValue('85268');
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('CREATED_AT_ASC');
    expect(requests).toEqual([
      {
        filter: { city: 'fountain', state: 'AZ', zipCode: '85268' },
        sort: 'CREATED_AT_ASC',
        limit: 20,
        offset: 0,
      },
    ]);
  });

  it('FR-11 AC3a: Back restores the previous filter in the inputs, the request and the rows', async () => {
    const requests = serveProperties(({ filter }) =>
      filter?.city === 'Austin' ? [middle] : filter?.city === 'Boston' ? [oldest] : [],
    );
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByText('No properties yet');
    const city = () => screen.getByRole('textbox', { name: 'City' });

    await user.type(city(), 'Austin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await expect.poll(rowStreets).toEqual(['2 Middle Ave']);
    await user.clear(city());
    await user.type(city(), 'Boston');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await expect.poll(rowStreets).toEqual(['1 Oldest Rd']);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(urlSearch()).toBe('?city=Austin');
    expect(city()).toHaveValue('Austin');
    await expect.poll(rowStreets).toEqual(['2 Middle Ave']);
    expect(requests.at(-1)).toEqual({
      filter: { city: 'Austin' },
      sort: 'CREATED_AT_DESC',
      limit: 20,
      offset: 0,
    });
  });

  it('FR-11 AC3a: applying the same filters again adds no history entry', async () => {
    serveProperties(() => [middle]);
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByRole('link', { name: '2 Middle Ave' });

    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Austin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(urlSearch()).toBe('?city=Austin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(urlSearch()).toBe('');
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('');
  });

  it('FR-11 AC3a: Apply with unchanged filters on a link with another key order keeps the URL', async () => {
    serveProperties(() => [middle]);
    const user = userEvent.setup();
    renderListWithProbe('/?zip=85268&city=Austin');
    await screen.findByRole('link', { name: '2 Middle Ave' });

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(urlSearch()).toBe('?zip=85268&city=Austin');
  });

  it('FR-11 AC3a: City text typed but not applied survives a sort change', async () => {
    serveProperties(() => [newest]);
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByRole('link', { name: '3 Newest St' });

    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Aus');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Oldest first');

    expect(urlSearch()).toBe('?sort=asc');
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('Aus');
  });

  it('FR-11 AC3a: an invalid state in the URL is ignored and the valid city is still applied', async () => {
    const requests = serveProperties(() => [middle]);

    renderListWithProbe('/?state=XX&city=austin');

    expect(await screen.findByRole('link', { name: '2 Middle Ave' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('austin');
    expect(requests).toEqual([
      { filter: { city: 'austin' }, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 },
    ]);
    expect(urlSearch()).toBe('?state=XX&city=austin');
  });

  it('FR-11 AC4: with 45 matches shows the first 20 rows, "Page 1 of 3", the total and a disabled Previous', async () => {
    const { listRequests } = serveStore(pagedItems(45));

    renderListWithProbe();

    expect(await screen.findByRole('link', { name: '1 Paged St' })).toBeInTheDocument();
    expect(rowStreets()).toEqual(pagedStreets(1, 20));
    expect(screen.getByText('45 properties')).toBeInTheDocument();
    const bar = within(pagination() as HTMLElement);
    expect(bar.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(bar.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(listRequests).toEqual([{ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 }]);
  });

  it('FR-11 AC4: Next and Previous move by 20 rows, write the page to the URL and disable Next on the last page', async () => {
    const { listRequests } = serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByRole('link', { name: '1 Paged St' });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await expect.poll(rowStreets).toEqual(pagedStreets(21, 40));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(urlSearch()).toBe('?page=2');
    expect(listRequests.at(-1)).toEqual({
      filter: {},
      sort: 'CREATED_AT_DESC',
      limit: 20,
      offset: 20,
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await expect.poll(rowStreets).toEqual(pagedStreets(41, 45));
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    await expect.poll(rowStreets).toEqual(pagedStreets(21, 40));
    expect(urlSearch()).toBe('?page=2');
  });

  it('FR-11 AC4: 20 matches show no pagination bar, 21 matches show "Page 1 of 2"', async () => {
    serveStore(pagedItems(20));
    const { unmount } = renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '20 Paged St' });
    expect(pagination()).not.toBeInTheDocument();
    unmount();

    serveStore(pagedItems(21));
    renderWithProviders(<ListPage />);

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(rowStreets()).toEqual(pagedStreets(1, 20));
  });

  it('FR-11 AC4: opening a URL with a filter and page=2 sends offset 20 with the filter in the first request', async () => {
    const { listRequests } = serveStore(pagedItems(45));

    renderListWithProbe('/?city=Austin&page=2');

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(rowStreets()).toEqual(pagedStreets(21, 40));
    expect(listRequests).toEqual([
      { filter: { city: 'Austin' }, sort: 'CREATED_AT_DESC', limit: 20, offset: 20 },
    ]);
  });

  it('FR-11 AC4: applying a new filter on page 2 goes back to page 1', async () => {
    const { listRequests } = serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe('/?page=2');
    await screen.findByText('Page 2 of 3');

    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Austin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(urlSearch()).toBe('?city=Austin');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(listRequests.at(-1)).toEqual({
      filter: { city: 'Austin' },
      sort: 'CREATED_AT_DESC',
      limit: 20,
      offset: 0,
    });
  });

  it('FR-11 AC4: a sort change on page 2 goes back to page 1', async () => {
    const { listRequests } = serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe('/?page=2');
    await screen.findByText('Page 2 of 3');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Oldest first');

    expect(urlSearch()).toBe('?sort=asc');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(listRequests.at(-1)).toEqual({
      filter: {},
      sort: 'CREATED_AT_ASC',
      limit: 20,
      offset: 0,
    });
  });

  it('FR-11 AC4: Apply with the filter unchanged on page 2 keeps the page and sends nothing', async () => {
    const { listRequests } = serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe('/?city=Austin&page=2');
    await screen.findByText('Page 2 of 3');

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(urlSearch()).toBe('?city=Austin&page=2');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(listRequests).toHaveLength(1);
  });

  it('FR-11 AC4: Back after Next returns to page 1', async () => {
    serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe();
    await screen.findByRole('link', { name: '1 Paged St' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await expect.poll(rowStreets).toEqual(pagedStreets(21, 40));

    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(urlSearch()).toBe('');
    await expect.poll(rowStreets).toEqual(pagedStreets(1, 20));
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('FR-11 AC4: a page past the end is replaced by the last page, with no history entry for it', async () => {
    serveStore(pagedItems(45));
    const user = userEvent.setup();
    renderListWithProbe('/?page=9', ['/']);

    await expect.poll(rowStreets).toEqual(pagedStreets(41, 45));
    expect(urlSearch()).toBe('?page=3');
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(urlSearch()).toBe('');
    await expect.poll(rowStreets).toEqual(pagedStreets(1, 20));
  });

  it('FR-11 AC4: Back to page 3 from a filter with fewer matches keeps page 3 while the old rows show', async () => {
    // The rows of `?city=Boston` (1 page) stay as placeholder data while `?page=3` loads, so
    // its total must not count for the past-the-end check.
    const items = pagedItems(45);
    server.use(
      api.query<object, PropertiesQueryVariables>('Properties', ({ variables }) => {
        const matches = variables.filter?.city === 'Boston' ? items.slice(0, 5) : items;
        return HttpResponse.json(propertiesPayload(pageOf(matches, variables), matches.length));
      }),
    );
    const user = userEvent.setup();
    renderListWithProbe('/?city=Boston', ['/?page=3']);
    await expect.poll(rowStreets).toEqual(pagedStreets(1, 5));

    await user.click(screen.getByRole('button', { name: 'Browser back' }));

    await expect.poll(rowStreets).toEqual(pagedStreets(41, 45));
    expect(urlSearch()).toBe('?page=3');
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('FR-11 AC4: deleting the only row on the last page moves to the page before', async () => {
    serveStore(pagedItems(41));
    const user = userEvent.setup();
    renderListWithProbe('/?page=3');
    await user.click(await screen.findByRole('button', { name: 'Delete 41 Paged St' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete property?' });

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await expect.poll(urlSearch).toBe('?page=2');
    await expect.poll(rowStreets).toEqual(pagedStreets(21, 40));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('FR-11 AC4: a page link with no matches goes to page 1 and shows the empty state', async () => {
    const { listRequests } = serveStore([]);

    renderListWithProbe('/?page=2');

    await expect.poll(urlSearch).toBe('');
    expect(await screen.findByText('No properties yet')).toBeInTheDocument();
    expect(pagination()).not.toBeInTheDocument();
    await expect
      .poll(() => listRequests.at(-1))
      .toEqual({ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 });
  });

  it('FR-11 AC4: while the next page loads, Previous and Next stay focusable but do nothing, and "Updating…" shows', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const items = pagedItems(45);
    const offsets: (number | null | undefined)[] = [];
    server.use(
      api.query<object, PropertiesQueryVariables>('Properties', async ({ variables }) => {
        offsets.push(variables.offset);
        if (variables.offset === 20) await held;
        return HttpResponse.json(propertiesPayload(pageOf(items, variables), items.length));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '1 Paged St' });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Updating…');
    expect(rowStreets()).toEqual(pagedStreets(1, 20));
    // `aria-disabled`, not `disabled`: a disabled button drops keyboard focus to <body> (R1).
    for (const name of ['Previous', 'Next']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    release();
    await expect.poll(rowStreets).toEqual(pagedStreets(21, 40));
    expect(offsets).toEqual([0, 20]);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    for (const name of ['Previous', 'Next']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'false');
    }
  });

  it('FR-11 AC4: an invalid page in the URL is ignored and the valid city is still applied', async () => {
    const { listRequests } = serveStore(pagedItems(45));

    renderListWithProbe('/?page=abc&city=austin');

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(listRequests).toEqual([
      { filter: { city: 'austin' }, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 },
    ]);
    expect(urlSearch()).toBe('?page=abc&city=austin');
  });

  it('FR-11 AC3: City accepts at most 100 characters and Zip code at most 5', async () => {
    renderWithProviders(<ListPage />);
    await screen.findByText('No properties yet');

    expect(screen.getByRole('textbox', { name: 'City' })).toHaveAttribute('maxLength', '100');
    expect(screen.getByRole('textbox', { name: 'Zip code' })).toHaveAttribute('maxLength', '5');
  });

  it('FR-11 AC3: the State select offers all states plus DC after "All states"', async () => {
    renderWithProviders(<ListPage />);
    await screen.findByText('No properties yet');

    const options = within(screen.getByRole('combobox', { name: 'State' })).getAllByRole('option');
    expect(options).toHaveLength(52);
    expect(options[0]).toHaveTextContent('All states');
    expect(options[0]).toHaveValue('');
    expect(screen.getByRole('option', { name: 'DC – District of Columbia' })).toHaveValue('DC');
  });

  it('FR-11 AC6: shows a loading status until the first response arrives', async () => {
    server.use(
      api.query('Properties', async () => {
        await delay(50);
        return HttpResponse.json(propertiesPayload([newest]));
      }),
    );

    renderWithProviders(<ListPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading properties…');
    expect(await screen.findByRole('link', { name: '3 Newest St' })).toBeInTheDocument();
    expect(screen.queryByText('Loading properties…')).not.toBeInTheDocument();
  });

  it('FR-11 AC6: with no properties shows the empty state with a link to add one', async () => {
    renderWithProviders(<ListPage />);

    expect(await screen.findByText('No properties yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a property' })).toHaveAttribute(
      'href',
      '/properties/new',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('FR-11 AC6: with filters and no match says that nothing matches', async () => {
    serveProperties(({ filter }) => (filter?.state ? [] : [middle]));
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);
    await screen.findByRole('link', { name: '2 Middle Ave' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'WY – Wyoming');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('No properties match the filters')).toBeInTheDocument();
    expect(screen.queryByText('No properties yet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a property' })).toHaveAttribute(
      'href',
      '/properties/new',
    );
  });

  it.each(['City', 'Zip code'])(
    'FR-11 AC6: a whitespace-only %s is a blank filter: left out of the URL and the request, and the empty state is "No properties yet"',
    async (field) => {
      const requests = serveProperties(() => []);
      const user = userEvent.setup();
      renderListWithProbe();
      await screen.findByText('No properties yet');

      await user.type(screen.getByRole('textbox', { name: field }), '   ');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      // The URL would not change, so Apply does not navigate and nothing is re-fetched.
      expect(urlSearch()).toBe('');
      expect(requests).toEqual([{ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 }]);
      expect(screen.getByText('No properties yet')).toBeInTheDocument();
      expect(screen.queryByText('No properties match the filters')).not.toBeInTheDocument();
    },
  );

  it.each(['city', 'zip'])(
    'FR-11 AC6: a whitespace-only %s in the URL is a blank filter: left out of the request, and the empty state is "No properties yet"',
    async (key) => {
      const requests = serveProperties(() => []);
      renderListWithProbe(`/?${key}=+++`);

      expect(await screen.findByText('No properties yet')).toBeInTheDocument();
      expect(requests).toEqual([{ filter: {}, sort: 'CREATED_AT_DESC', limit: 20, offset: 0 }]);
      expect(screen.queryByText('No properties match the filters')).not.toBeInTheDocument();
    },
  );

  it('FR-11 AC6: a failed request shows an error, and Retry requests again and shows the rows', async () => {
    let calls = 0;
    server.use(
      api.query('Properties', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(propertiesPayload([middle]));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ListPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load properties');
    expect(calls).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: '2 Middle Ave' })).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-11 AC7: the street links to the details route of that property', async () => {
    serveProperties(() => [middle]);
    function DetailsProbe() {
      return <h1>Details of {useParams().id}</h1>;
    }
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/properties/:id" element={<DetailsProbe />} />
      </Routes>,
    );

    await user.click(await screen.findByRole('link', { name: '2 Middle Ave' }));

    expect(await screen.findByRole('heading', { name: 'Details of id-2' })).toBeInTheDocument();
  });

  it('FR-11 AC5: confirming sends DeleteProperty, closes the dialog and the row disappears', async () => {
    const { listRequests, deletedIds } = serveStore([newest, middle, oldest]);
    const { user, dialog } = await openDeleteDialog('2 Middle Ave');
    expect(dialog).toHaveTextContent('2 Middle Ave, Austin, TX 78701');

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(deletedIds).toEqual(['id-2']);
    expect(listRequests).toHaveLength(2);
    expect(rowStreets()).toEqual(['3 Newest St', '1 Oldest Rd']);
  });

  it('FR-11 AC5: Cancel closes the dialog and sends nothing', async () => {
    const { listRequests, deletedIds } = serveStore([newest, middle]);
    const { user, dialog } = await openDeleteDialog('3 Newest St');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deletedIds).toEqual([]);
    expect(listRequests).toHaveLength(1);
    expect(rowStreets()).toEqual(['3 Newest St', '2 Middle Ave']);
  });

  it('NFR-09: PROPERTY_NOT_FOUND on delete says the property is gone and re-fetches the list', async () => {
    // Someone else deleted it first: the store no longer has it, and the API says so.
    const { listRequests, deletedIds } = serveStore([newest, middle], (_id, remove) => {
      remove();
      return notFoundResponse();
    });
    const { user, dialog } = await openDeleteDialog('2 Middle Ave');

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This property no longer exists',
    );
    expect(deletedIds).toEqual(['id-2']);
    await expect.poll(rowStreets).toEqual(['3 Newest St']);
    expect(listRequests).toHaveLength(2);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('NFR-09: a failed delete shows the generic message, keeps the dialog and the row, and does not re-fetch', async () => {
    const { listRequests, deletedIds } = serveStore([newest, middle], () => HttpResponse.error());
    const { user, dialog } = await openDeleteDialog('2 Middle Ave');

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete the property, try again',
    );
    expect(deletedIds).toEqual(['id-2']);
    expect(listRequests).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(rowStreets()).toEqual(['3 Newest St', '2 Middle Ave']);
  });
});
