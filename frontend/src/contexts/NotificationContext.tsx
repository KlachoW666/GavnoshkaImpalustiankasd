import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'signal' | 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  createdAt: number;
}

interface NotificationContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const Context = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id' | 'createdAt'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { ...t, id, createdAt: Date.now() };
    setToasts((prev) => [...prev.slice(-9), toast]);
    const duration = t.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((p) => p.filter((x) => x.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((p) => p.filter((x) => x.id !== id));
  }, []);

  const clearAll = useCallback(() => setToasts([]), []);

  return (
    <Context.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
    </Context.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
