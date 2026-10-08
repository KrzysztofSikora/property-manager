import { screen, within } from '@testing-library/react';
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

  it('marks "Properties" in the Main navigation as the current page on the list only', async () => {
    renderWithProviders(<AppRoutes />, { route: '/' });

    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Properties' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'New property' })).toHaveAttribute(
      'href',
      '/properties/new',
    );
    expect(within(main).queryByRole('link', { name: 'New property' })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Properties' }),
    ).toBeInTheDocument();
  });

  it('leaves "Properties" without aria-current on the create page', async () => {
    renderWithProviders(<AppRoutes />, { route: '/properties/new' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'New property' }),
    ).toBeInTheDocument();
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Properties' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
