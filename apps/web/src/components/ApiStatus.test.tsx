import { screen } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { api, server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { ApiStatus } from './ApiStatus';

describe('ApiStatus', () => {
  it('shows checking, then ok when the health query succeeds', async () => {
    renderWithProviders(<ApiStatus />);

    expect(screen.getByText('API: checking…')).toBeInTheDocument();
    expect(await screen.findByText('API: ok')).toBeInTheDocument();
  });

  it('shows unreachable on a network error', async () => {
    server.use(api.query('Health', () => HttpResponse.error()));

    renderWithProviders(<ApiStatus />);

    expect(await screen.findByText('API: unreachable')).toBeInTheDocument();
  });
});
