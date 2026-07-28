'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';

const schema = z.object({
  description:   z.string().min(1),
  amount:        z.coerce.number().positive(),
  paymentMethod: z.enum(['cash','bank','orange_money','afrimoney','qmoney']),
  date:          z.string(),
});
type FormValues = z.infer<typeof schema>;

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  draft:     Clock,
  submitted: Clock,
  approved:  CheckCircle,
  rejected:  XCircle,
};
const STATUS_COLORS: Record<string, string> = {
  draft:     'text-slate-500 bg-slate-50',
  submitted: 'text-amber-700 bg-amber-50',
  approved:  'text-emerald-700 bg-emerald-50',
  rejected:  'text-red-700 bg-red-50',
};

export default function ExpensesPage() {
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/expenses'),
  });
  const expenses = data?.data ?? [];

  const { register, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10) },
  });

  const createMutation = useMutation({
    mutationFn: (body: FormValues) => api.post('/v1/expenses', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setShowForm(false); reset(); toast.success('Expense recorded'); },
    onError: () => toast.error('Failed to save expense'),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/v1/expenses/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/v1/expenses/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Expenses</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4">New Expense</h2>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Description *</label>
              <input {...register('description')} placeholder="Office supplies, fuel…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Amount (SLE) *</label>
              <input {...register('amount')} type="number" step="0.01" placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
              <input {...register('date')} type="date"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Payment Method</label>
              <select {...register('paymentMethod')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white">
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="orange_money">Orange Money</option>
                <option value="afrimoney">Afrimoney</option>
              </select>
            </div>
            <div className="col-span-4 flex gap-2">
              <LoadingButton type="submit" loading={createMutation.isPending} loadingText="Saving…"
                className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium">
                Save Expense
              </LoadingButton>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Ref', 'Description', 'Date', 'Amount', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={6} className="p-0"><TableSkeleton rows={5} cols={6} /></td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">No expenses yet</td></tr>
            ) : expenses.map((e: unknown) => {
              const exp = e as Record<string, unknown>;
              const status = exp['status'] as string;
              const Icon = STATUS_ICONS[status] ?? Clock;
              return (
                <tr key={exp['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{exp['expenseNumber'] as string}</td>
                  <td className="px-4 py-3 font-medium">{exp['description'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(exp['date'] as string)}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(Number(exp['totalAmount']))}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium', STATUS_COLORS[status])}>
                      <Icon className="w-3 h-3" />
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {status === 'draft' && (
                        <button onClick={() => submitMutation.mutate(exp['id'] as string)}
                          className="text-xs text-amber-700 hover:underline">Submit</button>
                      )}
                      {status === 'submitted' && (
                        <button onClick={() => approveMutation.mutate(exp['id'] as string)}
                          className="text-xs text-emerald-700 hover:underline">Approve</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
