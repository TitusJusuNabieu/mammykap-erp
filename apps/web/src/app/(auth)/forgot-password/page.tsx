'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LoadingButton } from '@/components/ui/spinner';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent,  setSent]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      await authApi.forgotPassword(data.email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-500 mb-6">
                If an account exists for <strong>{getValues('email')}</strong>, you will receive a password reset link shortly.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-brand-primary font-medium hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-slate-900 mb-1">Forgot password?</h1>
              <p className="text-slate-500 text-sm mb-6">
                Enter your email and we&rsquo;ll send a reset link.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Email address</label>
                  <input
                    {...register('email')}
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.sl"
                    className={cn(
                      'w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors',
                      'focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
                      errors.email ? 'border-red-300 bg-red-50' : 'border-slate-300',
                    )}
                  />
                  {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
                </div>

                <LoadingButton
                  type="submit"
                  loading={isSubmitting}
                  loadingText="Sending link…"
                  className={cn(
                    'w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white',
                    'bg-brand-primary hover:bg-brand-light transition-colors',
                  )}
                >
                  Send reset link
                </LoadingButton>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                Remember it?{' '}
                <Link href="/login" className="text-brand-primary font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
