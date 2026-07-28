import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export function LoadingButton({ loading, loadingText, children, disabled, className, ...props }: LoadingButtonProps) {
  return (
    <button {...props} disabled={loading || disabled} className={cn('inline-flex items-center justify-center gap-2 transition-all', 'disabled:opacity-60 disabled:cursor-not-allowed', className)}>
      {loading && <Spinner className="w-4 h-4 flex-shrink-0" />}
      {loading ? (loadingText ?? 'Please wait…') : children}
    </button>
  );
}
