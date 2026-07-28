import { useState, useCallback } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

// Module-level singleton so any component can call toast() without prop drilling
type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();

export function toast(message: string, variant: ToastVariant = 'info') {
  const t: Toast = { id: Math.random().toString(36).slice(2), message, variant };
  listeners.forEach((fn) => fn(t));
}
toast.success = (msg: string) => toast(msg, 'success');
toast.error   = (msg: string) => toast(msg, 'error');

export function useToastStore() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const addToast = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
  }, []);

  return { toasts, subscribe, addToast };
}
