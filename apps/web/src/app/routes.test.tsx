import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { AppRoutes } from './routes';

describe('AppRoutes', () => {
  it.each([
    ['/', 'Properties'],
    ['/properties/new', 'New property'],
    ['/properties/abc-123', 'Property not found'],
    ['/no/such/page', 'Page not found'],
  ])('%s renders the "%s" heading', async (route, heading) => {
    renderWithProviders(<AppRoutes />, { route });

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});
