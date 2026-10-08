import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/routes';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element');
}

// No automatic retries: the error states show at once, and their Retry button is the retry.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
