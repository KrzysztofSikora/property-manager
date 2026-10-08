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

// The `<dd>` text of each `<dt>` label in `scope`, in page order.
function details(scope: HTMLElement) {
  return Object.fromEntries(
    within(scope)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  );
}

// The `<dt>` → `<dd>` text of the region called `name` (a hero section or a card).
function region(name: string) {
  return details(screen.getByRole('region', { name }));
}

// The hero temperature: its unit sits in a nested span, so match on the whole text.
function temperature(text: string) {
  return within(screen.getByRole('region', { name: 'Current weather' })).getByText(
    (_content, element) => element?.textContent === text,
  );
}

function withCurrent(current: Partial<PropertyFixture['weatherData']['current']>) {
  return propertyFixture({
    id: 'id-9',
    weatherData: { units: 'IMPERIAL', current: { ...property.weatherData.current, ...current } },
  });
}

const TILES = {
  Wind: '6 mph NE',
  Humidity: '34 %',
  'Cloud cover': '0 %',
  'UV index': '0',
  Pressure: '1010 mb',
  Visibility: '6 mi',
};

const LOCATION = {
  Street: '15528 E Golden Eagle Blvd',
  City: 'Fountain Hills',
  State: 'AZ',
  'Zip code': '85268',
  Latitude: '33.609',
  Longitude: '-111.729',
};

const PRECIPITATION = {
  Precipitation: '0 in',
  'Cloud cover': '0 %',
  Observed: '01:13 PM UTC',
};

const SUN_AND_MOON = {
  Sunrise: '06:25 AM',
  Sunset: '06:03 PM',
  Moonrise: '03:22 AM',
  Moonset: '04:27 PM',
  'Moon phase': 'Waning Crescent',
  Illumination: '15 %',
};

const AIR_QUALITY = {
  'PM2.5': '4.6 µg/m³',
  PM10: '10.4 µg/m³',
  'O₃': '21 µg/m³',
  'NO₂': '6.9 µg/m³',
  'SO₂': '0.2 µg/m³',
  CO: '112 µg/m³',
  'GB DEFRA index': '1',
};

const STREET = '15528 E Golden Eagle Blvd';

describe('DetailsPage', () => {
  it('FR-12 AC1: shows the address, coordinates, creation date and key weather with units', async () => {
    const ids = serveProperty(found(property));

    renderDetails();

    expect(await screen.findByRole('heading', { level: 1, name: STREET })).toBeInTheDocument();
    const subLine = screen.getByText(/^Fountain Hills, AZ 85268 · created/);
    expect(subLine).toHaveTextContent('Fountain Hills, AZ 85268 · created Sep 14, 2026, 3:42 PM');
    const hero = screen.getByRole('region', { name: 'Current weather' });
    expect(temperature('82 °F')).toHaveTextContent(/^82 °F$/);
    expect(within(hero).getByText('Clear')).toBeInTheDocument();
    expect(within(hero).getByText(/^Feels like 79 °F/)).toBeInTheDocument();
    expect(details(hero)).toMatchObject({ Wind: '6 mph NE', Humidity: '34 %' });
    expect(within(hero).getByRole('img', { name: 'Clear' })).toHaveAttribute(
      'src',
      property.weatherData.current.weatherIcons[0],
    );
    expect(region('Location')).toEqual(LOCATION);
    expect(ids).toEqual(['id-9']);
  });

  it('FR-12 AC2: says the coordinates are town-level and the weather is as of creation', async () => {
    serveProperty(found(property));

    renderDetails();

    const location = await screen.findByRole('region', { name: 'Location' });
    expect(
      within(location).getByText(
        'Coordinates are those of the town Weatherstack resolved the address to, not of the building.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Weather is as of when the property was created. It is not refreshed.'),
    ).toBeInTheDocument();
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
    serveProperty(found(withCurrent({ weatherDescriptions: [], weatherIcons: [] })));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: STREET });
    const hero = screen.getByRole('region', { name: 'Current weather' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(within(hero).queryByText('Clear')).not.toBeInTheDocument();
    expect(temperature('82 °F')).toBeInTheDocument();
    expect(within(hero).getByText(/^Feels like 79 °F/)).toBeInTheDocument();
    expect(details(hero)).toEqual(TILES);
  });

  it('FR-12 AC6: shows the extra weather, astronomy and air quality with units', async () => {
    serveProperty(found(property));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: STREET });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Location', 'Air quality', 'Sun and moon', 'Precipitation']);
    const hero = screen.getByRole('region', { name: 'Current weather' });
    expect(details(hero)).toEqual(TILES);
    expect(within(hero).getByText('Feels like 79 °F · observed 01:13 PM UTC')).toBeInTheDocument();
    expect(region('Precipitation')).toEqual(PRECIPITATION);
    expect(region('Sun and moon')).toEqual(SUN_AND_MOON);
    expect(region('Air quality')).toEqual(AIR_QUALITY);
    expect(
      within(screen.getByRole('region', { name: 'Air quality' })).getByText('US EPA 1 (Good)'),
    ).toBeInTheDocument();
  });

  it('FR-12 AC6: zero values are shown, not left out', async () => {
    const astro = {
      sunrise: null,
      sunset: null,
      moonrise: null,
      moonset: null,
      moonPhase: null,
      moonIllumination: 0,
    };
    serveProperty(found(withCurrent({ uvIndex: 0, precip: 0, astro })));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: STREET });
    expect(region('Current weather')).toHaveProperty('UV index', '0');
    expect(region('Precipitation')).toHaveProperty('Precipitation', '0 in');
    expect(region('Sun and moon')).toEqual({ Illumination: '0 %' });
  });

  it.each([
    ['astro', { astro: null }, 'Sun and moon'],
    ['airQuality', { airQuality: null }, 'Air quality'],
  ] as const)(
    'FR-12 AC5: a missing %s leaves out its card, the rest still shows',
    async (_name, current, missing) => {
      serveProperty(found(withCurrent(current)));

      renderDetails();

      await screen.findByRole('heading', { level: 1, name: STREET });
      expect(screen.queryByRole('region', { name: missing })).not.toBeInTheDocument();
      expect(screen.getAllByRole('region')).toHaveLength(4);
      expect(region('Current weather')).toEqual(TILES);
      expect(region('Precipitation')).toEqual(PRECIPITATION);
      expect(temperature('82 °F')).toBeInTheDocument();
    },
  );

  it('FR-12 AC5: an air quality with only the US EPA index shows the card with only the badge', async () => {
    const airQuality = {
      co: null,
      no2: null,
      o3: null,
      so2: null,
      pm2_5: null,
      pm10: null,
      usEpaIndex: 1,
      gbDefraIndex: null,
    };
    serveProperty(found(withCurrent({ airQuality })));

    renderDetails();

    const card = await screen.findByRole('region', { name: 'Air quality' });
    expect(within(card).getByText('US EPA 1 (Good)')).toBeInTheDocument();
    expect(within(card).queryAllByRole('term')).toHaveLength(0);
  });

  it('FR-12 AC5: a missing US EPA index leaves out only the badge', async () => {
    const { airQuality } = property.weatherData.current;
    if (!airQuality) throw new Error('the fixture has air quality');
    serveProperty(found(withCurrent({ airQuality: { ...airQuality, usEpaIndex: null } })));

    renderDetails();

    const card = await screen.findByRole('region', { name: 'Air quality' });
    expect(region('Air quality')).toEqual(AIR_QUALITY);
    expect(within(card).queryByText(/US EPA/)).not.toBeInTheDocument();
  });

  it('FR-12 AC5: a missing pressure leaves out only its tile', async () => {
    serveProperty(found(withCurrent({ pressure: null })));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: STREET });
    expect(region('Current weather')).toEqual({ ...TILES, Pressure: undefined });
    expect(region('Current weather')).not.toHaveProperty('Pressure');
    expect(region('Precipitation')).toEqual(PRECIPITATION);
    expect(region('Sun and moon')).toEqual(SUN_AND_MOON);
    expect(region('Air quality')).toEqual(AIR_QUALITY);
  });

  it('FR-12 AC5: a card whose fields are all missing is left out', async () => {
    serveProperty(found(withCurrent({ observationTime: null, precip: null, cloudCover: null })));

    renderDetails();

    await screen.findByRole('heading', { level: 1, name: STREET });
    expect(screen.queryByRole('region', { name: 'Precipitation' })).not.toBeInTheDocument();
    expect(region('Current weather')).toEqual({
      Wind: '6 mph NE',
      Humidity: '34 %',
      'UV index': '0',
      Pressure: '1010 mb',
      Visibility: '6 mi',
    });
    expect(region('Sun and moon')).toEqual(SUN_AND_MOON);
  });

  it('NFR-09: shows a loading status while the property loads', async () => {
    serveProperty(async () => {
      await delay(50);
      return found(property)();
    });

    renderDetails();

    expect(screen.getByRole('status')).toHaveTextContent('Loading property…');
    expect(await screen.findByRole('heading', { level: 1, name: STREET })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { level: 1, name: STREET })).toBeInTheDocument();
    expect(ids).toEqual(['id-9', 'id-9']);
  });
});
