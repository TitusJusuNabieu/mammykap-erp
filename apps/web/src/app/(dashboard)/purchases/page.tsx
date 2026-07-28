'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Tab = 'pos' | 'grn' | 'payments';

export default function PurchasesPage() {
  const [tab, setTab] = useState<Tab>('pos');

  const { data: posData } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/purchase-orders'),
  });
  const { data: grnData } = useQuery({
    queryKey: ['grn'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/grn'),
  });

  const TABS = [
    { id: 'pos' as Tab, label: 'Purchase Orders' },
    { id: 'grn' as Tab, label: 'Received Goods' },
    { id: 'payments' as Tab, label: 'Supplier Payments' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Purchases</h1>
        <button className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light transition-colors">
          <Plus className="w-4 h-4" />
          New Purchase Order
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Number', 'Supplier', 'Date', 'Total', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tab === 'pos' && (posData?.data ?? []).map((po: unknown) => {
              const p = po as Record<string, unknown>;
              return (
                <tr key={p['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{p['poNumber'] as string}</td>
                  <td className="px-4 py-3">{p['supplierId'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(p['date'] as string)}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(Number(p['totalAmount']))}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
                      p['status'] === 'draft' ? 'bg-slate-100 text-slate-600' :
                      p['status'] === 'sent' ? 'bg-blue-50 text-blue-700' :
                      'bg-emerald-50 text-emerald-700'
                    )}>{p['status'] as string}</span>
                  </td>
                </tr>
              );
            })}
            {tab === 'grn' && (grnData?.data ?? []).map((g: unknown) => {
              const grn = g as Record<string, unknown>;
              return (
                <tr key={grn['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{grn['grnNumber'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{grn['supplierId'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(grn['date'] as string)}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(Number(grn['totalCost']))}</td>
                  <td className="px-4 py-3"><span className="badge-paid text-xs px-2 py-1 rounded-full">received</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
