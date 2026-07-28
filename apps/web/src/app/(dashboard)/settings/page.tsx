'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';
import {
  Upload, Link2, UserPlus, ShieldCheck,
  UserX, Copy, CheckCircle2,
} from 'lucide-react';

/* ─── Constants ────────────────────────────────────── */
const PLANS = [
  { id: 'starter',  label: 'Starter',  price: 500_000,   users: 3,   branches: 1,  products: '500' },
  { id: 'growth',   label: 'Growth',   price: 1_200_000, users: 10,  branches: 3,  products: '5,000' },
  { id: 'business', label: 'Business', price: 2_500_000, users: 25,  branches: 10, products: '50,000' },
];

const NETWORKS = [
  { id: 'orange_money', label: 'Orange Money' },
  { id: 'afrimoney',    label: 'Afrimoney' },
  { id: 'qmoney',       label: 'QMoney' },
];

const ROLES = [
  { id: 'accountant',         label: 'Accountant' },
  { id: 'branch_manager',     label: 'Branch Manager' },
  { id: 'inventory_officer',  label: 'Inventory Officer' },
  { id: 'cashier',            label: 'Cashier' },
  { id: 'employee',           label: 'Employee' },
  { id: 'viewer',             label: 'Viewer' },
];

const ROLE_COLORS: Record<string, string> = {
  org_owner:         'bg-purple-100 text-purple-700',
  accountant:        'bg-blue-100 text-blue-700',
  branch_manager:    'bg-indigo-100 text-indigo-700',
  inventory_officer: 'bg-amber-100 text-amber-700',
  cashier:           'bg-emerald-100 text-emerald-700',
  employee:          'bg-slate-100 text-slate-600',
  viewer:            'bg-slate-100 text-slate-500',
};

type Tab = 'org' | 'print' | 'team' | 'billing';

/* ─── Input helper ──────────────────────────────────── */
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors';

/* ─── Page ──────────────────────────────────────────── */
export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab]             = useState<Tab>('org');
  const [selectedPlan, setSelectedPlan] = useState('starter');
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [showInvite, setShowInvite]     = useState(false);
  const [copied, setCopied]             = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* Queries */
  const { data: orgData }      = useQuery({ queryKey: ['org'],          queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org') });
  const { data: subData }      = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/billing/subscription') });
  const { data: settingsData } = useQuery({ queryKey: ['org-settings'], queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org/settings') });
  const { data: usersData }    = useQuery({ queryKey: ['org-users'],    queryFn: () => api.get<{ data: unknown[] }>('/v1/org/users'), enabled: tab === 'team' });

  const org  = orgData?.data;
  const sub  = subData?.data;
  const orgSlug   = String(org?.['slug'] ?? '');
  const loginUrl  = orgSlug ? `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/login?org=${orgSlug}` : '';

  /* Forms */
  const orgForm      = useForm<Record<string, unknown>>();
  const settingsForm = useForm<Record<string, unknown>>();
  const payForm      = useForm({ defaultValues: { phoneNumber: '', network: 'orange_money' } });
  const inviteForm   = useForm({ defaultValues: { email: '', role: 'cashier' } });

  useEffect(() => {
    if (org) { orgForm.reset(org); setLogoPreview(org['logoUrl'] as string ?? null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);

  useEffect(() => {
    if (settingsData?.data) settingsForm.reset(settingsData.data);
  }, [settingsData, settingsForm]);

  /* Mutations */
  const orgMutation = useMutation({
    mutationFn: (body: unknown) => api.patch('/v1/org', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); toast.success('Organisation profile saved'); },
    onError: (e) => toast.error((e as Error).message),
  });

  const settingsMutation = useMutation({
    mutationFn: (body: unknown) => api.patch('/v1/org/settings', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-settings'] }); toast.success('Settings saved'); },
    onError: (e) => toast.error((e as Error).message),
  });

  const payMutation = useMutation({
    mutationFn: (body: { phoneNumber: string; network: string }) =>
      api.post<{ data: { message: string } }>('/v1/billing/initiate', { ...body, plan: selectedPlan }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscription'] }); toast.success('Payment request sent to your phone — approve it to activate.'); },
    onError: (e) => toast.error((e as Error).message),
  });

  const patchUserMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/v1/org/users/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('User updated'); },
    onError: (e) => toast.error((e as Error).message),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; role: string }) => api.post('/v1/org/invite', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Invitation sent'); setShowInvite(false); inviteForm.reset(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const copyLoginUrl = () => {
    if (!loginUrl) return;
    navigator.clipboard.writeText(loginUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const currentPlan = PLANS.find((p) => p.id === (sub?.['plan'] as string)) ?? PLANS[0]!;
  const members = (usersData?.data ?? []) as Array<Record<string, unknown>>;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'org',     label: 'Organisation' },
    { id: 'print',   label: 'Receipt & Invoice' },
    { id: 'team',    label: 'Team' },
    { id: 'billing', label: 'Billing' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Organisation tab ─────────────────────────── */}
      {tab === 'org' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Organisation Profile</h2>

            {/* Login URL chip */}
            {loginUrl && (
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 mb-5 border border-slate-200 text-xs">
                <Link2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-slate-500 flex-1 truncate font-mono">{loginUrl}</span>
                <button onClick={copyLoginUrl} className="flex items-center gap-1 text-brand-primary hover:text-brand-light font-medium flex-shrink-0">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            <form onSubmit={orgForm.handleSubmit((d) => orgMutation.mutate(d))} className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0">
                    {logoPreview
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                      : <Upload className="w-6 h-6 text-slate-300" />}
                  </div>
                  <div className="space-y-1.5">
                    <input type="file" accept="image/*" className="hidden" ref={logoInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const url = ev.target?.result as string;
                          setLogoPreview(url);
                          orgForm.setValue('logoUrl', url, { shouldDirty: true });
                        };
                        reader.readAsDataURL(file);
                      }} />
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                      className="text-sm text-brand-primary border border-brand-primary/30 rounded-lg px-3 py-1.5 hover:bg-brand-primary/5 transition-colors">
                      Upload logo
                    </button>
                    <p className="text-xs text-slate-400">PNG, JPG or SVG — shown on receipts & invoices</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Organisation Name</label>
                <input {...orgForm.register('name')} placeholder="My Business Ltd" className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
                  <input {...orgForm.register('phone')} placeholder="+23276000000" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                  <input {...orgForm.register('email')} type="email" placeholder="info@business.sl" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Address</label>
                <textarea {...orgForm.register('address')} rows={2} placeholder="15 Siaka Stevens Street, Freetown" className={cn(inputCls, 'resize-none')} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Website</label>
                  <input {...orgForm.register('website')} placeholder="https://mybusiness.sl" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">TIN</label>
                  <input {...orgForm.register('tin')} placeholder="SL-1234567" className={cn(inputCls, 'font-mono')} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Registration Number</label>
                <input {...orgForm.register('registrationNumber')} placeholder="RC-0001234" className={cn(inputCls, 'font-mono')} />
              </div>

              <LoadingButton type="submit" loading={orgMutation.isPending} loadingText="Saving…"
                disabled={!orgForm.formState.isDirty}
                className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light">
                Save Profile
              </LoadingButton>
            </form>
          </div>

          {/* Tax settings */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Tax & Operations</h2>
            <form onSubmit={settingsForm.handleSubmit((d) => settingsMutation.mutate(d))} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Enable Tax (GST/VAT)</p>
                  <p className="text-xs text-slate-400 mt-0.5">Apply tax to taxable products on sale</p>
                </div>
                <input type="checkbox" {...settingsForm.register('enableTax')} className="w-4 h-4 accent-brand-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Default Tax Rate (%)</label>
                <input {...settingsForm.register('defaultTaxRate')} type="number" step="0.01" min="0" max="100" className={cn(inputCls, 'w-32')} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Receipt Number Prefix</label>
                <input {...settingsForm.register('receiptPrefix')} placeholder="RCP" className={cn(inputCls, 'w-32 font-mono')} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Allow Negative Stock</p>
                  <p className="text-xs text-slate-400 mt-0.5">Sell even when stock is zero</p>
                </div>
                <input type="checkbox" {...settingsForm.register('allowNegativeStock')} className="w-4 h-4 accent-brand-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Deposit / Layaway Grace Period (days)</label>
                <p className="text-xs text-slate-400 mb-1.5">
                  A customer who pays now and collects later keeps the quoted price within this many days.
                  Past it, the store request is repriced at the product&rsquo;s current selling price when supplied.
                </p>
                <input {...settingsForm.register('depositGracePeriodDays')} type="number" step="1" min="0" className={cn(inputCls, 'w-32')} />
              </div>
              <LoadingButton type="submit" loading={settingsMutation.isPending} loadingText="Saving…"
                disabled={!settingsForm.formState.isDirty}
                className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light">
                Save Settings
              </LoadingButton>
            </form>
          </div>
        </>
      )}

      {/* ── Receipt & Invoice tab ──────────────────────── */}
      {tab === 'print' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Receipt &amp; Invoice Customization</h2>
          <form onSubmit={settingsForm.handleSubmit((d) => settingsMutation.mutate(d))} className="space-y-5">
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Receipt (80mm Thermal)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Header Text</label>
                  <input {...settingsForm.register('receiptHeaderText')} placeholder="Official Receipt · VAT Registered" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Footer Text</label>
                  <textarea {...settingsForm.register('receiptFooterText')} rows={2} className={cn(inputCls, 'resize-none')} />
                </div>
                <Toggle label="Show logo on receipt"     name="showLogoOnReceipt"    form={settingsForm} />
                <Toggle label="Show TIN on receipt"      name="showTinOnReceipt"     form={settingsForm} />
              </div>
            </section>

            <div className="border-t border-slate-100" />

            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Invoice / Quotation (A4)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Footer Text</label>
                  <textarea {...settingsForm.register('invoiceFooterText')} rows={2} className={cn(inputCls, 'resize-none')} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Terms &amp; Conditions</label>
                  <textarea {...settingsForm.register('invoiceTerms')} rows={3} placeholder="e.g. Goods once sold are not returnable…" className={cn(inputCls, 'resize-none')} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Bank Transfer Details</label>
                  <textarea {...settingsForm.register('invoiceBankDetails')} rows={3}
                    placeholder={'Bank: Sierra Leone Commercial Bank\nAcc Name: My Business Ltd\nAcc No: 1234567890'}
                    className={cn(inputCls, 'resize-none font-mono text-xs')} />
                </div>
                <Toggle label="Show logo on invoice"    name="showLogoOnInvoice"   form={settingsForm} />
                <Toggle label="Show TIN on invoice"     name="showTinOnInvoice"    form={settingsForm} />
              </div>
            </section>

            <LoadingButton type="submit" loading={settingsMutation.isPending} loadingText="Saving…"
              disabled={!settingsForm.formState.isDirty}
              className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light">
              Save Settings
            </LoadingButton>
          </form>
        </div>
      )}

      {/* ── Team tab ──────────────────────────────────── */}
      {tab === 'team' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team Members</h2>
              <p className="text-xs text-slate-400 mt-0.5">Manage who has access to your workspace</p>
            </div>
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light transition-colors">
              <UserPlus className="w-4 h-4" /> Invite member
            </button>
          </div>

          {/* Invite modal */}
          {showInvite && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="font-semibold text-slate-900 text-sm">Invite a team member</h3>
              <form onSubmit={inviteForm.handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Email address</label>
                  <input {...inviteForm.register('email', { required: true })} type="email" placeholder="colleague@business.sl" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Role</label>
                  <select {...inviteForm.register('role')} className={cn(inputCls, 'bg-white')}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <LoadingButton type="submit" loading={inviteMutation.isPending} loadingText="Sending…"
                    className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light">
                    Send invitation
                  </LoadingButton>
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Members list */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {members.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading team…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m['id'] as string} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-primary font-semibold text-xs">
                              {(m['fullName'] as string)?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{m['fullName'] as string}</p>
                            <p className="text-xs text-slate-400">{m['email'] as string}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {m['role'] === 'org_owner' ? (
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS['org_owner'])}>
                            <ShieldCheck className="w-3 h-3" /> Owner
                          </span>
                        ) : (
                          <select
                            defaultValue={m['role'] as string}
                            onChange={(e) => patchUserMutation.mutate({ id: m['id'] as string, body: { role: e.target.value } })}
                            className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                          >
                            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          m['isActive'] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                          {m['isActive'] ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m['role'] !== 'org_owner' && (
                          <button
                            onClick={() => patchUserMutation.mutate({ id: m['id'] as string, body: { isActive: !m['isActive'] } })}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title={m['isActive'] ? 'Deactivate' : 'Activate'}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Org login link card */}
          {loginUrl && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Team Login Link</p>
              <p className="text-xs text-slate-500 mb-3">Share this link with your team — they&rsquo;ll see your organisation&rsquo;s branding on the login page.</p>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-xs font-mono text-slate-700 flex-1 truncate">{loginUrl}</span>
                <button onClick={copyLoginUrl} className="flex items-center gap-1 text-xs text-brand-primary font-medium flex-shrink-0">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Billing tab ───────────────────────────────── */}
      {tab === 'billing' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Current Subscription</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-brand-primary capitalize">{String(sub?.['plan'] ?? 'Trial')}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status: <span className={cn('font-medium', sub?.['status'] === 'active' ? 'text-emerald-600' : 'text-amber-600')}>
                    {String(sub?.['status'] ?? 'trialing')}
                  </span>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-slate-500">Period ends</p>
                <p className="font-medium">
                  {sub?.['currentPeriodEnd']
                    ? new Date(sub['currentPeriodEnd'] as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              {[
                ['Max Users',    sub?.['maxUsers']    ?? currentPlan.users],
                ['Max Branches', sub?.['maxBranches'] ?? currentPlan.branches],
                ['Max Products', sub?.['maxProducts'] ?? currentPlan.products],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-slate-400">{String(label)}</p>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{String(val)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Upgrade via Mobile Money</h2>
            <p className="text-xs text-slate-500">Processed by <strong>Monime</strong> — Sierra Leone&rsquo;s mobile money infrastructure.</p>

            <div className="grid grid-cols-3 gap-3">
              {PLANS.map((plan) => (
                <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                  className={cn('border rounded-xl p-4 text-left transition-colors',
                    selectedPlan === plan.id ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20' : 'border-slate-200 hover:border-slate-300')}>
                  <p className="text-sm font-bold text-slate-900">{plan.label}</p>
                  <p className="text-base font-bold text-brand-primary mt-1">{formatCurrency(plan.price)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                    <li>{plan.users} users · {plan.branches} {plan.branches === 1 ? 'branch' : 'branches'}</li>
                    <li>{plan.products} products</li>
                  </ul>
                </button>
              ))}
            </div>

            <form onSubmit={payForm.handleSubmit((d) => payMutation.mutate(d))} className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Mobile Money Number</label>
                  <input {...payForm.register('phoneNumber', { required: true })} placeholder="+23276000000" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Network</label>
                  <select {...payForm.register('network')} className={cn(inputCls, 'bg-white')}>
                    {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
              </div>
              <LoadingButton type="submit" loading={payMutation.isPending} loadingText="Sending payment request…"
                className="w-full bg-brand-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-light">
                Pay {formatCurrency(PLANS.find((p) => p.id === selectedPlan)?.price ?? 0)} via Mobile Money
              </LoadingButton>
              <p className="text-xs text-center text-slate-400">A prompt will be sent to your phone — approve it to activate your plan.</p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Toggle helper ─────────────────────────────────── */
function Toggle({ label, name, form }: { label: string; name: string; form: ReturnType<typeof useForm<Record<string, unknown>>> }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-700">{label}</p>
      <input type="checkbox" {...form.register(name)} className="w-4 h-4 accent-brand-primary" />
    </div>
  );
}
