import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { TradingSignal } from '../../types/signal';

export function useSignals(limit = 50) {
  return useQuery<TradingSignal[]>({
    queryKey: ['signals', limit],
    queryFn: () => api.get<TradingSignal[]>(`/signals?limit=${limit}`),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useSignalsPreview() {
  return useQuery<TradingSignal[]>({
    queryKey: ['signals', 10],
    queryFn: () => api.get<TradingSignal[]>('/signals?limit=10'),
    staleTime: 10_000,
  });
}
