import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../app/routes';
import type { DeletePropertyMutationVariables, PropertyQueryVariables } from '../graphql/graphql';
import { type PropertyFixture, propertyFixture } from '../test/fixtures';
import { api, server } from '../test/msw';
import { renderWithProviders } from '../test/render';

const property = propertyFixture({ id: 'id-9' });

// Serves `respond()` for `Property` and records the id of every request.
function serveProperty(respond: () => Response | Promise<Response>) {
  const ids: string[] = [];
  server.use(
    api.query<object, PropertyQueryVariables>('Property', ({ variables }) => {
      // Codegen types an `ID` input as `string | number`. The app sends strings.
      ids.push(String(variables.id));
      return respond();
    }),
  );
  return ids;
}

function found(value: PropertyFixture) {
  return () => HttpResponse.json({ data: { property: value } });
}

// Serves `DeleteProperty` with `respond` and records the id of every request.
function serveDelete(respond: (id: string) => Response) {
  const ids: string[] = [];
  server.use(
    api.mutation<object, DeletePropertyMutationVariables>('DeleteProperty', ({ variables }) => {
      const id = String(variables.id);
      ids.push(id);
      return respond(id);
    }),
  );
  return ids;
}

function renderDetails(id = property.id) {
  renderWithProviders(<AppRoutes />, { route: `/properties/${id}` });
}

// The browser's Back button, which the app itself does not render.
function GoBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Go back
    </button>
  );
}

// The `<dd>` text of each `<dt>` label, in page order.
function details() {
  return Object.fromEntries(
    screen
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  );
}

describe('DetailsPage', () => {
  it('FR-12 AC1: shows the address, coordinates, creation date and key weather with units', async () => {
    const ids = serveProperty(found(property));

    renderDetails();

    expect(
      await screen.findByRole('heading', { level: 1, name: '15528 E Golden Eagle Blvd' }),
    ).toBeInTheDocument();
    expect(details()).toEqual({
      Address: '15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268',
      Coordinates: '33.609, -111.729',
      Created: 'Sep 14, 2026, 3:42 PM',
      Temperature: '82 °F',
      'Feels like': '79 °F',
      Conditions: 'Clear',
      Wind: '6 mph NE',
      Humidity: '34 %',
    });
    expect(screen.getByRole('img', { name: 'Clear' })).toHaveAttribute(
      'src',
      property.weatherData.current.weatherIcons[0],
    );
    expect(ids).toEqual(['id-9']);
  });

  it('FR-12 AC2: says the coordinates are town-level and the weather is as of creation', async () => {
    serveProperty(found(property));

    renderDetails();

    expect(
      await screen.findByText(
        /Coordinates are those of the town Weatherstack resolved the address to, not of the building\./,
      ),
    ).toHaveTextContent('Weather is as of when the property was created.');
  });

  it('FR-12 AC3: an unknown id shows "Property not found" with a link back to the list', async () => {
    const ids = serveProperty(() => HttpResponse.json({ data: { property: null } }));
    const user = userEvent.setup();

    renderDetails('no-such-id');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Property not found' }),
    ).toBeInTheDocument();
    expect(ids).toEqual(['no-such-id']);
    await user.click(screen.getByRole('link', { name: 'Back to properties' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Properties' }),
    ).toBeInTheDocument();
  });

  it('FR-12 AC4: confirming delete sends DeleteProperty and returns to the list without a refetch', async () => {
    const propertyIds = serveProperty(found(property));
    const deletedIds = serveDelete((id) => HttpResponse.json({ data: { deleteProperty: id } }));
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete property?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Properties' }),
    ).toBeInTheDocument();
    expect(deletedIds).toEqual(['id-9']);
    expect(propertyIds).toEqual(['id-9']);
    expect(screen.queryByRole('heading', { name: 'Property not found' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-12 AC4: going Back after the delete does not show the deleted property from cache', async () => {
    let deleted = false;
    // The re-request after Back is held, so a cached frame would still be on screen.
    const propertyIds = serveProperty(async () => {
      if (!deleted) return HttpResponse.json({ data: { property } });
      await delay(50);
      return HttpResponse.json({ data: { property: null } });
    });
    serveDelete((id) => {
      deleted = true;
      return HttpResponse.json({ data: { deleteProperty: id } });
    });
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AppRoutes />
        <GoBack />
      </>,
      { route: `/properties/${property.id}` },
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await screen.findByRole('heading', { level: 1, name: 'Properties' });
    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(screen.getByRole('status')).toHaveTextContent('Loading property…');
    expect(screen.queryByRole('heading', { name: property.street })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Property not found' }),
    ).toBeInTheDocument();
    expect(propertyIds).toEqual(['id-9', 'id-9']);
  });

  it('FR-12 AC4: PROPERTY_NOT_FOUND on delete also returns to the list, with no message', async () => {
    const propertyIds = serveProperty(found(property));
    const deletedIds = serveDelete(() =>
      HttpResponse.json({
        data: null,
        errors: [
          {
            message: 'No property with this id exists.',
            extensions: { code: 'PROPERTY_NOT_FOUND' },
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Properties' }),
    ).toBeInTheDocument();
    expect(deletedIds).toEqual(['id-9']);
    expect(propertyIds).toEqual(['id-9']);
    expect(screen.queryByRole('heading', { name: 'Property not found' })).not.toBeInTheDocument();
    expect(screen.queryByText('This property no longer exists')).not.toBeInTheDocument();
  });

  it('FR-12 AC5: empty description and icon lists leave out the conditions and the icon', async () => {
    const bare = propertyFixture({
      id: 'id-9',
      weatherData: {
        units: 'IMPERIAL',
        current: {
          ...property.weatherData.current,
          weatherDescriptions: [],
          weatherIcons: [],
        },
      },
    });
    serveProperty(found(bare));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: '15528 E Golden Eagle Blvd' });
    expect(Object.keys(details())).toEqual([
      'Address',
      'Coordinates',
      'Created',
      'Temperature',
      'Feels like',
      'Wind',
      'Humidity',
    ]);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('NFR-09: shows a loading status while the property loads', async () => {
    serveProperty(async () => {
      await delay(50);
      return found(property)();
    });

    renderDetails();

    expect(screen.getByRole('status')).toHaveTextContent('Loading property…');
    expect(
      await screen.findByRole('heading', { level: 1, name: '15528 E Golden Eagle Blvd' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('NFR-09: a network error shows an alert whose Retry re-requests the property', async () => {
    let fail = true;
    const ids = serveProperty(() => (fail ? HttpResponse.error() : found(property)()));
    const user = userEvent.setup();
    renderDetails();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the property');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '15528 E Golden Eagle Blvd' }),
    ).toBeInTheDocument();
    expect(ids).toEqual(['id-9', 'id-9']);
  });
});
