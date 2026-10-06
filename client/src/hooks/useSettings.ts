import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { setCurrencyFormat } from '@/utils/money';
import type { AppSettings } from '@/types/settings';

export function useSettings() {
  const branchId = useAuthStore((s) => s.branchId);
  return useQuery({
    queryKey: ['settings', branchId],
    queryFn: async () => {
      const s = await api.get<AppSettings>('/settings');
      setCurrencyFormat(s.currency);
      return s;
    },
    staleTime: 5 * 60_000,
    enabled: !!branchId,
  });
}
