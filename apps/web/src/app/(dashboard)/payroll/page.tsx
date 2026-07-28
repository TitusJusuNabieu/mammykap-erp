'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

export default function PayrollPage() {
  const [tab, setTab] = useState<'runs' | 'employees'>('runs');
  const qc = useQueryClient();

  const { data: runsData, isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/payroll-runs'),
  });
  const { data: empData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/employees'),
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => api.post(`/v1/payroll-runs/${id}/post`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });

  const runs = runsData?.data ?? [];
  const employees = empData?.data ?? [];

  const STATUS_COLORS: Record<string, string> = {
    draft:    'bg-slate-100 text-slate-600',
    posted:   'bg-emerald-50 text-emerald-700',
    paid:     'bg-blue-50 text-blue-700',
    cancelled:'bg-red-50 text-red-600',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Payroll</h1>
        <button className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light">
          <Plus className="w-4 h-4" />
          New Payroll Run
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[{ id: 'runs' as const, label: 'Payroll Runs' }, { id: 'employees' as const, label: `Employees (${employees.length})` }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'runs' && (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {['Run #', 'Period', 'Payment Date', 'Gross', 'Net', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No payroll runs yet</td></tr>
              ) : runs.map((r: unknown) => {
                const run = r as Record<string, unknown>;
                return (
                  <tr key={run['id'] as string} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{run['runNumber'] as string}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{run['periodStart'] as string} – {run['periodEnd'] as string}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(run['paymentDate'] as string)}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(Number(run['totalGross']))}</td>
                    <td className="px-4 py-3 text-emerald-700 font-semibold">{formatCurrency(Number(run['totalNet']))}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-1 rounded-full font-medium', STATUS_COLORS[run['status'] as string] ?? 'bg-slate-100 text-slate-600')}>
                        {run['status'] as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {run['status'] === 'draft' && (
                        <button onClick={() => postMutation.mutate(run['id'] as string)}
                          className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline">
                          <PlayCircle className="w-3.5 h-3.5" />
                          Post
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'employees' && (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {['Employee #', 'Name', 'Position', 'Type', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No employees yet</td></tr>
              ) : employees.map((e: unknown) => {
                const emp = e as Record<string, unknown>;
                return (
                  <tr key={emp['id'] as string} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{emp['employeeNumber'] as string}</td>
                    <td className="px-4 py-3 font-medium">{emp['fullName'] as string}</td>
                    <td className="px-4 py-3 text-slate-500">{(emp['position'] as string) ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{(emp['employmentType'] as string)?.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-1 rounded-full', emp['isActive'] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {emp['isActive'] ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
