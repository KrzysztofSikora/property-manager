import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { api, server } from '../test/msw';
import { useCreateProperty } from './useCreateProperty';

const address = {
  street: '15528 E Golden Eagle Blvd',
  city: 'Fountain Hills',
  state: 'AZ',
  zipCode: '85268',
} as const;

function renderCreate(queryClient: QueryClient) {
  return renderHook(() => useCreateProperty(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('useCreateProperty', () => {
  it('sends the address and resolves to the new id', async () => {
    const sent: unknown[] = [];
    server.use(
      api.mutation('CreateProperty', ({ variables }) => {
        sent.push(variables);
        return HttpResponse.json({ data: { createProperty: { id: 'new-id' } } });
      }),
    );
    const { result } = renderCreate(newQueryClient());

    result.current.mutate(address);

    await expect.poll(() => result.current.isSuccess).toBe(true);
    expect(result.current.data).toBe('new-id');
    expect(sent).toEqual([address]);
  });

  it('marks cached lists stale and leaves cached details alone', async () => {
    server.use(
      api.mutation('CreateProperty', () =>
        HttpResponse.json({ data: { createProperty: { id: 'new-id' } } }),
      ),
    );
    const queryClient = newQueryClient();
    const listKey = ['properties', 'list', { filter: {}, sort: 'NEWEST' }];
    const detailKey = ['properties', 'detail', 'id-1'];
    queryClient.setQueryData(listKey, { properties: { items: [], totalCount: 0 } });
    queryClient.setQueryData(detailKey, { property: { id: 'id-1' } });
    const { result } = renderCreate(queryClient);

    result.current.mutate(address);

    await expect.poll(() => result.current.isSuccess).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });

  it('fails instead of resolving when createProperty is null', async () => {
    server.use(
      api.mutation('CreateProperty', () => HttpResponse.json({ data: { createProperty: null } })),
    );
    const queryClient = newQueryClient();
    const listKey = ['properties', 'list', {}];
    queryClient.setQueryData(listKey, { properties: { items: [], totalCount: 0 } });
    const { result } = renderCreate(queryClient);

    result.current.mutate(address);

    await expect.poll(() => result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('createProperty returned no property');
    expect(result.current.data).toBeUndefined();
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false);
  });
});
