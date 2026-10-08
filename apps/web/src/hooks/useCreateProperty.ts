import type { Address } from '@property-manager/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { graphql } from '../graphql';
import { execute } from '../lib/execute';

const CreatePropertyMutation = graphql(`
  mutation CreateProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {
    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {
      id
    }
  }
`);

// Resolves to the new property's id. The caller navigates; the hook owns the cache.
export function useCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      const { createProperty } = await execute(CreatePropertyMutation, address);
      // `null` without errors breaks the contract; it must not navigate to /properties/null.
      if (createProperty === null) throw new Error('createProperty returned no property');
      return createProperty.id;
    },
    // Returning the invalidation keeps the mutation pending until the lists are marked stale
    // (and active ones re-fetched). The details page fetches the new property itself.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['properties', 'list'] }),
  });
}
