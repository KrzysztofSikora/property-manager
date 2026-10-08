import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { graphql } from '../graphql';
import { execute } from '../lib/execute';
import { errorCode } from '../lib/graphql-errors';

const DeletePropertyMutation = graphql(`
  mutation DeleteProperty($id: ID!) {
    deleteProperty(id: $id)
  }
`);

// The property is gone: lists re-fetch, and a cached details entry of it is dropped. An active
// details query of that id is left alone, so an open details page does not re-fetch into "not
// found" before it navigates away. A delete changes no other property's details.
function forgetProperty(queryClient: QueryClient, id: string) {
  queryClient.removeQueries({
    queryKey: ['properties', 'detail', id],
    exact: true,
    type: 'inactive',
  });
  return queryClient.invalidateQueries({ queryKey: ['properties', 'list'] });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => execute(DeletePropertyMutation, { id }),
    // Returning the invalidation keeps the mutation pending until the list has re-fetched, so
    // the caller's success callback sees the list without the deleted row.
    onSuccess: (_data, id) => forgetProperty(queryClient, id),
    onError: (error, id) =>
      errorCode(error) === 'PROPERTY_NOT_FOUND' ? forgetProperty(queryClient, id) : undefined,
  });
}
