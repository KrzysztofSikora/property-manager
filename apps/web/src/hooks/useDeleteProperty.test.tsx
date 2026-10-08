import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { api, server } from '../test/msw';
import { useDeleteProperty } from './useDeleteProperty';

describe('useDeleteProperty', () => {
  it('drops the cached details of the deleted property and keeps those of others', async () => {
    server.use(
      api.mutation('DeleteProperty', () => HttpResponse.json({ data: { deleteProperty: 'id-2' } })),
    );
    // Cached by earlier visits to the details pages, with no page showing them now (inactive).
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['properties', 'detail', 'id-2'], { property: { id: 'id-2' } });
    queryClient.setQueryData(['properties', 'detail', 'id-3'], { property: { id: 'id-3' } });
    const { result } = renderHook(() => useDeleteProperty(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate('id-2');

    await expect.poll(() => result.current.isSuccess).toBe(true);
    // Re-opening the deleted property's page fetches it instead of showing stale details.
    expect(queryClient.getQueryData(['properties', 'detail', 'id-2'])).toBeUndefined();
    expect(queryClient.getQueryData(['properties', 'detail', 'id-3'])).toEqual({
      property: { id: 'id-3' },
    });
  });
});
