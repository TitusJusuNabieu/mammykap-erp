'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Copy, CheckCircle2, Link2 } from 'lucide-react';
import { LoadingButton } from '@/components/ui/spinner';

const schema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  orgName:  z.string().min(2, 'Business name required'),
  phone:    z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default function RegisterPage() {
  const router = useRouter();
  const [error,   setError]   = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [copied,  setCopied]  = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      const res = await authApi.register(data);
      setOrgSlug(res.data.organization.slug);
      setOrgName(res.data.organization.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const loginUrl = orgSlug ? `${BASE_URL}/login?org=${orgSlug}` : null;

  const copyUrl = async () => {
    if (!loginUrl) return;
    await navigator.clipboard.writeText(loginUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Success screen ────────────────────────────── */
  if (orgSlug !== null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-primary flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md w-full shadow-2xl">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Welcome to LEDGERA!</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your workspace for <strong>{orgName}</strong> is ready.
          </p>

          {/* Login URL card */}
          <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-brand-primary" />
              <span className="text-xs font-semibold text-brand-primary uppercase tracking-wide">Your team login link</span>
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200">
              <span className="flex-1 text-xs font-mono text-brand-primary truncate">{loginUrl}</span>
              <button onClick={copyUrl} className="text-slate-400 hover:text-brand-primary transition-colors flex-shrink-0">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Share this with your team — they&rsquo;ll see your business name on the login page.
            </p>
          </div>

          <button
            onClick={() => router.push(`/login?org=${orgSlug}`)}
            className="w-full bg-brand-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors"
          >
            Go to my workspace →
          </button>
        </div>
      </div>
    );
  }

  /* ── Registration form ─────────────────────────── */
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
          <p className="text-slate-400 text-sm">30-day free trial. No credit card required.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Create your account</h1>
          <p className="text-slate-500 text-sm mb-6">Get started in under 2 minutes</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {[
              { name: 'fullName', label: 'Your full name',      type: 'text',     placeholder: 'Aminata Koroma' },
              { name: 'orgName',  label: 'Business name',       type: 'text',     placeholder: 'Koroma General Traders' },
              { name: 'email',    label: 'Work email',          type: 'email',    placeholder: 'you@business.sl' },
              { name: 'phone',    label: 'Phone (optional)',    type: 'tel',      placeholder: '+232 76 000 000' },
              { name: 'password', label: 'Password',            type: 'password', placeholder: 'Min. 8 characters' },
            ].map((field) => (
              <div key={field.name}>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{field.label}</label>
                <input
                  {...register(field.name as keyof FormValues)}
                  type={field.type}
                  placeholder={field.placeholder}
                  autoComplete={field.name === 'password' ? 'new-password' : undefined}
                  className={cn(
                    'w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors',
                    'focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
                    errors[field.name as keyof FormValues] ? 'border-red-300 bg-red-50' : 'border-slate-300',
                  )}
                />
                {errors[field.name as keyof FormValues] && (
                  <p className="text-xs text-red-600 mt-1">{errors[field.name as keyof FormValues]?.message}</p>
                )}
              </div>
            ))}

            <LoadingButton
              type="submit"
              loading={isSubmitting}
              loadingText="Creating your workspace…"
              className={cn(
                'w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white',
                'bg-brand-primary hover:bg-brand-light transition-colors',
              )}
            >
              Create account
            </LoadingButton>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
