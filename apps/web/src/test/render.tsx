import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';

// `initialEntries` puts earlier history entries before `route`, which is the current one.
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', initialEntries = [] }: { route?: string; initialEntries?: string[] } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[...initialEntries, route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
