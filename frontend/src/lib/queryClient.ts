import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные считаются свежими 30с — навигация между страницами не вызывает повторных запросов
      staleTime: 30_000,
      // Кэш хранится 5 минут после unmount компонента
      gcTime: 5 * 60_000,
      retry: 1,
      // Не рефетчить при возврате в вкладку — торговые данные обновляются через WebSocket
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
