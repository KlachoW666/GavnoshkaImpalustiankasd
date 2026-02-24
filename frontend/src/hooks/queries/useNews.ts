import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { NewsItem } from '../../pages/Dashboard';

export function useNews() {
  return useQuery<NewsItem[]>({
    queryKey: ['news'],
    queryFn: () => api.get<{ news: NewsItem[] }>('/news').then((d) => d.news || []),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
