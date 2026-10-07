import { useQuery } from '@tanstack/react-query';
import { graphql } from '../graphql';
import { execute } from '../lib/execute';

// Placeholder until S-04: proves codegen → execute() → TanStack Query → Vite proxy.
const HealthQuery = graphql(`
  query Health {
    health
  }
`);

export function ApiStatus() {
  const { isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => execute(HealthQuery),
    // Show "unreachable" at once instead of after TanStack's default three retries.
    retry: false,
  });

  const label = isPending ? 'checking…' : isError ? 'unreachable' : 'ok';
  return (
    <p role="status" className="text-sm text-gray-500">
      API: {label}
    </p>
  );
}
