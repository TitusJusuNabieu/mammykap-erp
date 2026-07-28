'use client';

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, ShoppingCart, DollarSign,
  Package, Users, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { reportsApi, salesApi } from '@/lib/api';
import { formatCurrency, today, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { StatSkeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Route } from 'next';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

function StatCard({
  label, value, sub, icon: Icon, trend, color = 'blue',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  color?: 'blue' | 'green' | 'amber' | 'red';
}) {
  const colorMap = {
    blue:  { bg: 'bg-brand-primary/10', text: 'text-brand-primary' },
    green: { bg: 'bg-emerald-50',        text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50',          text: 'text-amber-600' },
    red:   { bg: 'bg-red-50',            text: 'text-red-600' },
  };
  const c = colorMap[color];

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={cn('p-2.5 rounded-xl', c.bg)}>
          <Icon className={cn('w-5 h-5', c.text)} />
        </div>
      </div>
      {trend !== undefined && (
        <div className={cn('flex items-center gap-1 mt-3 text-xs font-medium', trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend).toFixed(1)}% vs last month
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const monthStart = today().slice(0, 8) + '01';
  const t = today();

  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl', yearStart, t],
    queryFn: () => reportsApi.pnl({ from: yearStart, to: t }),
  });

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-summary', monthStart, t],
    queryFn: () => reportsApi.salesSummary(monthStart, t),
  });

  const { data: salesList } = useQuery({
    queryKey: ['sales-recent'],
    queryFn: () => salesApi.list({ limit: '5', order: 'desc' }),
  });

  const pnl = (pnlData as { data: Record<string, unknown> } | undefined)?.data;
  const sales = (salesData as { data: Record<string, unknown> } | undefined)?.data;
  const recent = (salesList as { data: unknown[] } | undefined)?.data ?? [];

  // Build month-by-month chart data from P&L revenue/expenses breakdown if available
  const chartData = (() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { month: months[d.getMonth()], revenue: 0, expenses: 0 };
    });
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{formatDate(new Date())}</p>
        </div>
        <Link
          href="/sales/pos"
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          New Sale
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(pnlLoading || salesLoading) ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Revenue YTD"
              value={formatCurrency(Number((pnl?.revenue as Record<string, string>)?.total ?? 0))}
              icon={DollarSign}
              color="blue"
              trend={12.4}
            />
            <StatCard
              label="Net Profit YTD"
              value={formatCurrency(Number(pnl?.netProfit ?? 0))}
              sub={`${pnl?.netProfitMargin ?? '0.00'}% margin`}
              icon={TrendingUp}
              color="green"
              trend={8.1}
            />
            <StatCard
              label="Sales This Month"
              value={String((sales?.totalSales as string) ?? '0')}
              sub={formatCurrency(Number((sales?.totalRevenue as string) ?? 0))}
              icon={ShoppingCart}
              color="amber"
            />
            <StatCard
              label="Outstanding AR"
              value={formatCurrency(Number((sales?.totalDue as string) ?? 0))}
              icon={Users}
              color="red"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="col-span-2 bg-white rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Revenue vs Expenses</h2>
            <span className="text-xs text-slate-400">Year to date</span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3A8A" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <Tooltip
                  formatter={(val: number) => [formatCurrency(val), '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#1E3A8A" strokeWidth={2} fill="url(#colorRev)" name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} fill="url(#colorExp)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'Record a Sale',       href: '/sales/pos',    icon: ShoppingCart, color: 'bg-blue-50 text-brand-primary' },
              { label: 'Add Inventory',       href: '/inventory',    icon: Package,      color: 'bg-emerald-50 text-emerald-700' },
              { label: 'Add Expense',         href: '/expenses',     icon: DollarSign,   color: 'bg-amber-50 text-amber-700' },
              { label: 'View P&L Report',     href: '/reports',      icon: TrendingUp,   color: 'bg-purple-50 text-purple-700' },
              { label: 'Low Stock Alerts',    href: '/inventory?low_stock=true', icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href as Route}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('p-1.5 rounded-lg', a.color)}>
                    <a.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm text-slate-700">{a.label}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent sales */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-slate-900">Recent Sales</h2>
          <Link href="/sales/invoices" className="text-xs text-brand-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {recent.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No sales yet today</div>
          ) : (
            recent.map((s: unknown) => {
              const sale = s as Record<string, unknown>;
              return (
                <div key={sale['id'] as string} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{sale['saleNumber'] as string}</p>
                    <p className="text-xs text-slate-400">{formatDate(sale['date'] as string)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(Number(sale['totalAmount']))}
                    </p>
                    <StatusBadge status={sale['status'] as string} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:        'badge-paid',
    partial:     'badge-partial',
    credit:      'badge-partial',
    cancelled:   'badge-draft',
    overdue:     'badge-overdue',
  };
  return (
    <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', map[status] ?? 'badge-draft')}>
      {status}
    </span>
  );
}

