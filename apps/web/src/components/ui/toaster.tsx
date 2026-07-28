'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type Toast } from '@/hooks/use-toast';

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
};

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
};

const ICON_STYLES = {
  success: 'text-emerald-500',
  error:   'text-red-500',
  info:    'text-blue-500',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.variant];
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium animate-in slide-in-from-right-4 duration-300', STYLES[toast.variant])}>
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', ICON_STYLES[toast.variant])} />
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, subscribe, addToast } = useToastStore();

  useEffect(() => {
    return subscribe(addToast);
  }, [subscribe, addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={() => {}} />
        </div>
      ))}
    </div>
  );
}
