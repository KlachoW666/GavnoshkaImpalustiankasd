import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { AppStats } from '../../pages/Dashboard';

export function useStats() {
  return useQuery<AppStats>({
    queryKey: ['stats'],
    queryFn: () => api.get<AppStats>('/stats'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
