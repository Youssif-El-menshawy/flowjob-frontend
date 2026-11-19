import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { removeDemoArtifacts } from '@/shared/lib/demoCleanup';
import { ThemeProvider } from '@/shared/lib/theme';
import { ToastProvider } from '@/shared/ui/Overlay';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { appRoutes } from '@/app/App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

function start() {
  void removeDemoArtifacts(); // leftovers from the removed in-browser demo; never touches real data
  const router = createBrowserRouter(appRoutes);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

start();
