import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { setCurrencyFormat } from '@/utils/money';
import type { AppSettings } from '@/types/settings';

export function useSettings() {
  const branchId = useAuthStore((s) => s.branchId);
  // Wait for the session to be restored, otherwise the first request after a reload is a 401
  const authed = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ['settings', branchId],
    queryFn: async () => {
      const s = await api.get<AppSettings>('/settings');
      setCurrencyFormat(s.currency);
      return s;
    },
    staleTime: 5 * 60_000,
    enabled: !!branchId && authed,
  });
}
