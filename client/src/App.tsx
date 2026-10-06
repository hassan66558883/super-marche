import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from '@/routes';
import { refreshSession } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore, applyTheme } from '@/stores/ui.store';
import { ApiError } from '@/services/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function App() {
  const { i18n } = useTranslation();
  const theme = useUiStore((s) => s.theme);

  // Restore the session from the httpOnly refresh cookie on first load
  useEffect(() => {
    if (useAuthStore.getState().status === 'unknown') void refreshSession();
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <Toaster richColors position={i18n.dir() === 'rtl' ? 'top-left' : 'top-right'} closeButton dir={i18n.dir()} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
