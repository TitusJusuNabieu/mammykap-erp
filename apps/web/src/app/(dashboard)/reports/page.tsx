'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, BookOpen, Package } from 'lucide-react';
import { reportsApi } from '@/lib/api';
import { formatCurrency, today } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Tab = 'pnl' | 'balance' | 'trial' | 'inventory';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pnl');
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const t = today();

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pnl',       label: 'Profit & Loss',   icon: TrendingUp },
    { id: 'balance',   label: 'Balance Sheet',    icon: BarChart3 },
    { id: 'trial',     label: 'Trial Balance',    icon: BookOpen },
    { id: 'inventory', label: 'Inventory Value',  icon: Package },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Reports</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === id
                ? 'bg-white text-brand-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'pnl' && <PnLReport from={yearStart} to={t} />}
      {tab === 'balance' && <BalanceSheet asOf={t} />}
      {tab === 'trial' && <TrialBalance from={yearStart} to={t} />}
      {tab === 'inventory' && <InventoryValuation />}
    </div>
  );
}

function PnLReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pnl', from, to],
    queryFn: () => reportsApi.pnl({ from, to }),
  });
  const pnl = (data as { data: Record<string, unknown> } | undefined)?.data;

  if (isLoading) return <Skeleton />;
  if (!pnl) return null;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm divide-y divide-slate-100 overflow-hidden">
      <div className="px-6 py-4 bg-slate-50">
        <h2 className="font-semibold text-slate-900">Profit & Loss</h2>
        <p className="text-xs text-slate-500 mt-0.5">{from} – {to}</p>
      </div>

      <Section title="Revenue" total={(pnl.revenue as Record<string, string>)?.total} lines={(pnl.revenue as Record<string, unknown>)?.lines as Array<Record<string, string>>} color="text-emerald-700" />
      <Section title="Cost of Goods Sold" total={(pnl.cogs as Record<string, string>)?.total} lines={(pnl.cogs as Record<string, unknown>)?.lines as Array<Record<string, string>>} color="text-slate-700" negate />

      <div className="flex justify-between px-6 py-3 bg-blue-50">
        <span className="text-sm font-semibold text-brand-primary">Gross Profit</span>
        <span className="text-sm font-bold text-brand-primary">{formatCurrency(Number(pnl.grossProfit))} <span className="font-normal text-xs">({pnl.grossProfitMargin as string}%)</span></span>
      </div>

      <Section title="Operating Expenses" total={(pnl.expenses as Record<string, string>)?.total} lines={(pnl.expenses as Record<string, unknown>)?.lines as Array<Record<string, string>>} color="text-red-700" negate />

      <div className={cn('flex justify-between px-6 py-3', Number(pnl.netProfit) >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
        <span className={cn('text-sm font-bold', Number(pnl.netProfit) >= 0 ? 'text-emerald-800' : 'text-red-800')}>
          Net {Number(pnl.netProfit) >= 0 ? 'Profit' : 'Loss'}
        </span>
        <span className={cn('text-sm font-bold', Number(pnl.netProfit) >= 0 ? 'text-emerald-700' : 'text-red-700')}>
          {formatCurrency(Math.abs(Number(pnl.netProfit)))} <span className="font-normal text-xs">({pnl.netProfitMargin as string}%)</span>
        </span>
      </div>
    </div>
  );
}

function Section({ title, total, lines, color, negate: _negate }: {
  title: string;
  total?: string;
  lines?: Array<Record<string, string>>;
  color: string;
  negate?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between px-6 py-3">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className={cn('text-sm font-semibold', color)}>{formatCurrency(Math.abs(Number(total ?? 0)))}</span>
      </div>
      {(lines ?? []).map((l, i) => (
        <div key={i} className="flex justify-between px-8 py-1.5 text-xs text-slate-500">
          <span>{l['accountCode']} — {l['accountName']}</span>
          <span>{formatCurrency(Math.abs(Number(l['amount'])))}</span>
        </div>
      ))}
    </div>
  );
}

function BalanceSheet({ asOf }: { asOf: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', asOf],
    queryFn: () => reportsApi.balanceSheet(asOf),
  });
  const bs = (data as { data: Record<string, unknown> } | undefined)?.data;

  if (isLoading) return <Skeleton />;
  if (!bs) return null;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 border-b border-border">
        <h2 className="font-semibold text-slate-900">Balance Sheet</h2>
        <p className="text-xs text-slate-500 mt-0.5">As of {asOf}</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-slate-100">
        <div>
          <BSSection title="Assets" data={(bs.assets as Record<string, unknown>)} />
        </div>
        <div>
          <BSSection title="Liabilities" data={(bs.liabilities as Record<string, unknown>)} />
          <BSSection title="Equity" data={(bs.equity as Record<string, unknown>)} />
          <div className="flex justify-between px-6 py-3 border-t border-border bg-slate-50">
            <span className="text-xs font-semibold text-slate-700">Total L + E</span>
            <span className="text-xs font-bold">{formatCurrency(Number(bs.totalLiabilitiesAndEquity))}</span>
          </div>
        </div>
      </div>
      <div className={cn('px-6 py-2 text-center text-xs', bs.isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
        {bs.isBalanced ? 'Balance sheet is balanced' : 'WARNING: Balance sheet does not balance'}
      </div>
    </div>
  );
}

function BSSection({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const lines = (data?.lines as Array<Record<string, string>>) ?? [];
  return (
    <div className="px-6 py-4">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-sm font-bold">{formatCurrency(Number(data?.total ?? 0))}</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between text-xs text-slate-500 py-1">
          <span>{l['accountCode']} — {l['accountName']}</span>
          <span>{formatCurrency(Number(l['balance']))}</span>
        </div>
      ))}
    </div>
  );
}

function TrialBalance({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', from, to],
    queryFn: () => reportsApi.trialBalance({ from, to }),
  });
  const tb = (data as { data: Record<string, unknown> } | undefined)?.data;
  const lines = (tb?.lines as Array<Record<string, string>>) ?? [];
  const totals = tb?.totals as Record<string, unknown>;

  if (isLoading) return <Skeleton />;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Trial Balance</h2>
          <p className="text-xs text-slate-500 mt-0.5">{from} – {to}</p>
        </div>
        <span className={cn('text-xs font-medium px-2 py-1 rounded-full', totals?.['isBalanced'] ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
          {totals?.['isBalanced'] ? 'Balanced' : 'Unbalanced'}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-border">
            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Code</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Account</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Debit</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {lines.map((l, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2 text-xs text-slate-500 font-mono">{l['accountCode']}</td>
              <td className="px-4 py-2 text-slate-700">{l['accountName']}</td>
              <td className="px-4 py-2 text-right text-slate-900 font-mono">
                {Number(l['totalDebit']) > 0 ? formatCurrency(Number(l['totalDebit'])) : '—'}
              </td>
              <td className="px-4 py-2 text-right text-slate-900 font-mono">
                {Number(l['totalCredit']) > 0 ? formatCurrency(Number(l['totalCredit'])) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
            <td colSpan={2} className="px-4 py-3 text-sm">Total</td>
            <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(totals?.['debit'] ?? 0))}</td>
            <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(totals?.['credit'] ?? 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function InventoryValuation() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => reportsApi.inventoryValuation(),
  });
  const inv = (data as { data: Record<string, unknown> } | undefined)?.data;
  const lines = (inv?.lines as Array<Record<string, string>>) ?? [];

  if (isLoading) return <Skeleton />;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Inventory Valuation</h2>
        <div className="text-right">
          <p className="text-xs text-slate-500">{inv?.itemCount as number} items</p>
          <p className="text-sm font-bold text-slate-900">{formatCurrency(Number(inv?.totalValue ?? 0))}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-border">
            {['SKU', 'Product', 'Qty', 'Avg Cost', 'Total Value'].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {lines.map((l, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2 text-xs text-slate-500 font-mono">{l['sku'] ?? '—'}</td>
              <td className="px-4 py-2 text-slate-800">{l['productName']}</td>
              <td className="px-4 py-2 text-slate-700">{l['quantity']}</td>
              <td className="px-4 py-2 text-slate-700 font-mono">{formatCurrency(Number(l['avgCost']))}</td>
              <td className="px-4 py-2 font-semibold text-slate-900">{formatCurrency(Number(l['totalValue']))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-border p-8 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
      ))}
    </div>
  );
}
