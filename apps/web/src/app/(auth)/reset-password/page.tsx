'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LoadingButton } from '@/components/ui/spinner';
import { CheckCircle2 } from 'lucide-react';

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormValues = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [done,  setDone]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    if (!token) { setError('Invalid or expired reset link. Please request a new one.'); return; }
    try {
      await authApi.resetPassword(token, data.password);
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed. The link may have expired.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-brand-secondary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">LEDGERA</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Password updated!</h2>
              <p className="text-sm text-slate-500">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-slate-900 mb-1">Set new password</h1>
              <p className="text-slate-500 text-sm mb-6">Choose a strong password for your account.</p>

              {!token && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
                  Invalid or expired reset link.{' '}
                  <Link href="/forgot-password" className="font-medium underline">Request a new one.</Link>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {[
                  { name: 'password',        label: 'New password',      placeholder: 'Min. 8 characters' },
                  { name: 'confirmPassword', label: 'Confirm password',  placeholder: 'Repeat password' },
                ].map((field) => (
                  <div key={field.name}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{field.label}</label>
                    <input
                      {...register(field.name as keyof FormValues)}
                      type="password"
                      autoComplete={field.name === 'password' ? 'new-password' : 'new-password'}
                      placeholder={field.placeholder}
                      className={cn(
                        'w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors',
                        'focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
                        errors[field.name as keyof FormValues] ? 'border-red-300 bg-red-50' : 'border-slate-300',
                      )}
                    />
                    {errors[field.name as keyof FormValues] && (
                      <p className="text-xs text-red-600 mt-1">
                        {errors[field.name as keyof FormValues]?.message}
                      </p>
                    )}
                  </div>
                ))}

                <LoadingButton
                  type="submit"
                  loading={isSubmitting}
                  loadingText="Updating password…"
                  disabled={!token}
                  className={cn(
                    'w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white',
                    'bg-brand-primary hover:bg-brand-light transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  Update password
                </LoadingButton>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                <Link href="/login" className="text-brand-primary font-medium hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
