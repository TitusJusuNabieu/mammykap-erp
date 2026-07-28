'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { LoadingButton } from '@/components/ui/spinner';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type FormValues = z.infer<typeof schema>;

interface OrgBrand {
  name: string;
  logoUrl?: string;
  slug: string;
}

function LoginForm() {
  const router       = useRouter();
  const params       = useSearchParams();
  const orgSlug      = params.get('org');
  const rawNext      = params.get('next');
  // Only allow internal, same-origin redirect targets — reject absolute/protocol-relative URLs to prevent open redirect.
  const nextPath     = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  const setAuth      = useAuthStore((s) => s.setAuth);

  const [error,    setError]    = useState<string | null>(null);
  const [orgBrand, setOrgBrand] = useState<OrgBrand | null>(null);
  const [brandLoading, setBrandLoading] = useState(!!orgSlug);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Fetch org branding when subdomain is detected
  useEffect(() => {
    if (!orgSlug) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    fetch(`${apiBase}/v1/auth/org-brand?slug=${orgSlug}`)
      .then((r) => r.json())
      .then((res) => { if (res.data) setOrgBrand(res.data); })
      .catch(() => { /* gracefully degrade to default branding */ })
      .finally(() => setBrandLoading(false));
  }, [orgSlug]);

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      const res = await authApi.login(data.email, data.password);
      const { access_token, user } = res.data;
      setAuth(
        {
          id:       user['id'] as string,
          fullName: user['full_name'] as string,
          email:    user['email'] as string,
          avatarUrl: user['avatar_url'] as string | null,
          role:     user['role'] as string,
          plan:     user['plan'] as string,
          orgId:    (user['organization'] as Record<string, string>)?.id ?? '',
          orgName:  (user['organization'] as Record<string, string>)?.name ?? '',
          branchId: null,
        },
        access_token,
      );
      router.push(nextPath as Route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const isOrgBranded = !!orgSlug && !brandLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo / Branding */}
        <div className="text-center mb-8">
          {isOrgBranded && orgBrand ? (
            <>
              {orgBrand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orgBrand.logoUrl}
                  alt={orgBrand.name}
                  className="h-16 mx-auto mb-3 object-contain drop-shadow"
                />
              ) : (
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold text-2xl">
                    {orgBrand.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <p className="text-white font-bold text-xl tracking-tight">{orgBrand.name}</p>
              <p className="text-slate-300 text-xs mt-1">Powered by LEDGERA</p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-brand-secondary rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">L</span>
                </div>
                <span className="text-white font-bold text-2xl tracking-tight">LEDGERA</span>
              </div>
              <p className="text-slate-400 text-sm">Every transaction tells a story.</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-6">
            {isOrgBranded && orgBrand
              ? `Sign in to ${orgBrand.name}`
              : 'Sign in to your account'}
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <Link href="/forgot-password" className="text-xs text-brand-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                {...register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className={cn(
                  'w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors',
                  'focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
                  errors.password ? 'border-red-300 bg-red-50' : 'border-slate-300',
                )}
              />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
            </div>

            <LoadingButton
              type="submit"
              loading={isSubmitting}
              loadingText="Signing in…"
              className={cn(
                'w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white',
                'bg-brand-primary hover:bg-brand-light transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2',
              )}
            >
              Sign in
            </LoadingButton>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            No account?{' '}
            <Link href="/register" className="text-brand-primary font-medium hover:underline">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
