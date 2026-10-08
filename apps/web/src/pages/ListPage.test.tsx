import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { Route, Routes, useParams } from 'react-router';
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

function propertiesPayload(items: PropertyListItem[]) {
  return { data: { properties: { items, totalCount: items.length } } };
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

// A stored list that `DeleteProperty` changes: `Properties` serves what is left, and both
// operations are recorded.
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
      return HttpResponse.json(propertiesPayload(items));
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
    expect(requests).toEqual([{ filter: {}, sort: 'CREATED_AT_DESC' }]);
    expect(requests[0]).not.toHaveProperty('limit');
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
      { filter: {}, sort: 'CREATED_AT_DESC' },
      { filter: { city: 'fountain', state: 'AZ' }, sort: 'CREATED_AT_DESC' },
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
    expect(requests[1]).toEqual({ filter: { zipCode: '02108' }, sort: 'CREATED_AT_DESC' });
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
    'FR-11 AC6: a whitespace-only %s is a blank filter: left out, and the empty state is "No properties yet"',
    async (field) => {
      const requests = serveProperties(() => []);
      const user = userEvent.setup();
      renderWithProviders(<ListPage />);
      await screen.findByText('No properties yet');

      await user.type(screen.getByRole('textbox', { name: field }), '   ');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await expect.poll(() => requests).toHaveLength(2);
      expect(requests[1]).toEqual({ filter: {}, sort: 'CREATED_AT_DESC' });
      expect(await screen.findByText('No properties yet')).toBeInTheDocument();
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
