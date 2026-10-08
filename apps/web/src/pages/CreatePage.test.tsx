import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { Route, Routes, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CreatePropertyMutationVariables } from '../graphql/graphql';
import { api, server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { CreatePage } from './CreatePage';

type Entered = { street: string; city: string; state: string; zipCode: string };

const valid: Entered = {
  street: '15528 E Golden Eagle Blvd',
  city: 'Fountain Hills',
  state: 'AZ',
  zipCode: '85268',
};

function DetailsStub() {
  const { id } = useParams();
  return <h1>Details {id}</h1>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/properties/new" element={<CreatePage />} />
      <Route path="/properties/:id" element={<DetailsStub />} />
    </Routes>,
    { route: '/properties/new' },
  );
}

// Serves `respond()` for `CreateProperty` and records the variables of every request. Installed
// in every test, so "no request sent" is asserted on this list, not on MSW's unhandled frames.
function serveCreate(respond: () => Response | Promise<Response> = created('new-id')) {
  const requests: CreatePropertyMutationVariables[] = [];
  server.use(
    api.mutation<object, CreatePropertyMutationVariables>('CreateProperty', ({ variables }) => {
      requests.push(variables);
      return respond();
    }),
  );
  return requests;
}

function created(id: string) {
  return () => HttpResponse.json({ data: { createProperty: { id } } });
}

function failure(code: string, message: string, extensions: Record<string, unknown> = {}) {
  return () =>
    HttpResponse.json({
      data: { createProperty: null },
      errors: [{ message, extensions: { code, ...extensions } }],
    });
}

const inputs = {
  street: () => screen.getByRole('textbox', { name: 'Street' }),
  city: () => screen.getByRole('textbox', { name: 'City' }),
  state: () => screen.getByRole('textbox', { name: 'State' }),
  zipCode: () => screen.getByRole('textbox', { name: 'Zip code' }),
};

async function fillAndSubmit(entered: Entered) {
  const user = userEvent.setup();
  renderPage();
  for (const field of ['street', 'city', 'state', 'zipCode'] as const) {
    if (entered[field] !== '') await user.type(inputs[field](), entered[field]);
  }
  await user.click(screen.getByRole('button', { name: 'Create property' }));
  return user;
}

function expectValuesKept(entered: Entered) {
  expect(inputs.street()).toHaveValue(entered.street);
  expect(inputs.city()).toHaveValue(entered.city);
  expect(inputs.state()).toHaveValue(entered.state);
  expect(inputs.zipCode()).toHaveValue(entered.zipCode);
}

describe('CreatePage', () => {
  it('keeps the "New property" heading and the four labelled inputs', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'New property' })).toBeInTheDocument();
    for (const input of Object.values(inputs)) expect(input()).not.toHaveAttribute('maxlength');
  });

  it('FR-13 AC1 / TR-21: an empty street, a 4-digit zip and "XX" show field messages and send nothing', async () => {
    const requests = serveCreate();

    await fillAndSubmit({ ...valid, street: '', state: 'XX', zipCode: '8526' });

    expect(inputs.street()).toHaveAccessibleDescription('must not be empty');
    expect(inputs.state()).toHaveAccessibleDescription(/2-letter US state code/);
    expect(inputs.zipCode()).toHaveAccessibleDescription('must be 5 digits');
    expect(inputs.street()).toHaveAttribute('aria-invalid', 'true');
    expect(inputs.city()).not.toHaveAccessibleDescription();
    expect(inputs.city()).not.toHaveAttribute('aria-invalid');
    expect(inputs.street()).toHaveFocus();
    expect(requests).toEqual([]);
  });

  it('FR-13 AC1: a 6-digit zip is reported, not cut to 5 digits', async () => {
    const requests = serveCreate();

    await fillAndSubmit({ ...valid, zipCode: '852681' });

    expect(inputs.zipCode()).toHaveValue('852681');
    expect(inputs.zipCode()).toHaveAccessibleDescription('must be 5 digits');
    expect(requests).toEqual([]);
  });

  it('FR-13 AC1: a lowercase valid state is accepted', async () => {
    const requests = serveCreate();

    await fillAndSubmit({ ...valid, state: 'az' });

    expect(await screen.findByRole('heading', { name: 'Details new-id' })).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('replaces the field and form messages on the next submit', async () => {
    const requests = serveCreate(failure('PROPERTY_ALREADY_EXISTS', 'exists'));
    const user = await fillAndSubmit({ ...valid, zipCode: '8526' });
    expect(inputs.zipCode()).toHaveAccessibleDescription('must be 5 digits');

    await user.type(inputs.zipCode(), '8');
    await user.click(screen.getByRole('button', { name: 'Create property' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(inputs.zipCode()).not.toHaveAccessibleDescription();
    expect(inputs.zipCode()).not.toHaveAttribute('aria-invalid');

    // Only the street is invalid now (the zip is valid): its message replaces the alert.
    await user.clear(inputs.street());
    await user.click(screen.getByRole('button', { name: 'Create property' }));

    expect(inputs.street()).toHaveAccessibleDescription('must not be empty');
    expect(inputs.zipCode()).not.toHaveAccessibleDescription();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('cancels the native form submission, so the browser does not reload the page', () => {
    serveCreate();
    renderPage();

    const form = screen.getByRole('button', { name: 'Create property' }).closest('form');
    if (form === null) throw new Error('the submit button is not in a form');

    // `fireEvent` returns false when a handler called `preventDefault()`.
    expect(fireEvent.submit(form)).toBe(false);
  });

  it('FR-13 AC2: sends the normalized address once, disables the button while pending, then opens the details page', async () => {
    const requests = serveCreate(async () => {
      await delay(50);
      return created('id-42')();
    });

    await fillAndSubmit({
      street: '  15528  E Golden Eagle Blvd ',
      city: 'Fountain   Hills',
      state: ' az',
      zipCode: '85268',
    });

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: 'Details id-42' })).toBeInTheDocument();
    expect(requests).toEqual([valid]);
  });

  it.each([
    {
      code: 'PROPERTY_ALREADY_EXISTS',
      message: 'A property with this address already exists.',
      shown: /already exists/i,
    },
    {
      code: 'WEATHER_QUOTA_EXCEEDED',
      message: 'quota',
      shown: /upgrade the plan or replace the api key/i,
    },
    {
      code: 'WEATHER_LOCATION_MISMATCH',
      message:
        'Weatherstack placed this address in "Nevada", not in AZ (Arizona). The property was not saved.',
      shown: /"Nevada", not in AZ \(Arizona\)/,
    },
    {
      code: 'WEATHER_UNAVAILABLE',
      message: 'unavailable',
      shown: /try again later/i,
    },
  ])(
    'FR-13 AC3 / TR-19: $code shows its cause and keeps the entered values',
    async ({ code, message, shown }) => {
      const requests = serveCreate(failure(code, message));

      await fillAndSubmit(valid);

      expect(await screen.findByRole('alert')).toHaveTextContent(shown);
      expectValuesKept(valid);
      expect(screen.getByRole('button', { name: 'Create property' })).toBeEnabled();
      expect(screen.queryByRole('heading', { name: /^Details/ })).not.toBeInTheDocument();
      expect(requests).toHaveLength(1);
    },
  );

  it('FR-13 AC4 / TR-19: BAD_USER_INPUT fields are shown next to their inputs, with no form-level alert', async () => {
    serveCreate(
      failure('BAD_USER_INPUT', 'Invalid input', {
        fields: [
          { field: 'zipCode', message: 'zip rejected by the server' },
          { field: 'state', message: 'state rejected by the server' },
        ],
      }),
    );

    await fillAndSubmit(valid);

    expect(await screen.findByText('zip rejected by the server')).toBeInTheDocument();
    expect(inputs.zipCode()).toHaveAccessibleDescription('zip rejected by the server');
    expect(inputs.state()).toHaveAccessibleDescription('state rejected by the server');
    expect(inputs.street()).not.toHaveAccessibleDescription();
    expect(inputs.state()).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectValuesKept(valid);
  });

  it('BAD_USER_INPUT without usable fields shows the table message at form level', async () => {
    serveCreate(failure('BAD_USER_INPUT', 'Invalid input', { fields: 'not a list' }));

    await fillAndSubmit(valid);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some fields are invalid. Check the values and try again.',
    );
  });

  it('a network error shows the generic message and keeps the entered values', async () => {
    serveCreate(() => HttpResponse.error());

    await fillAndSubmit(valid);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong, the property was not saved. Try again.',
    );
    expectValuesKept(valid);
  });
});
