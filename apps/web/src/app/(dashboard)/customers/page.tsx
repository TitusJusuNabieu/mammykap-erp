'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, User } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';

const schema = z.object({
  name:         z.string().min(1),
  phone:        z.string().optional(),
  email:        z.string().email().optional().or(z.literal('')),
  address:      z.string().optional(),
  creditLimit:  z.coerce.number().min(0),
});
type FormValues = z.infer<typeof schema>;

export default function CustomersPage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/customers'),
  });

  const customers = (data?.data ?? []).filter((c: unknown) => {
    const cust = c as Record<string, unknown>;
    return !search || (cust['name'] as string).toLowerCase().includes(search.toLowerCase());
  });

  const { register, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (body: FormValues) => api.post('/v1/customers', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false); reset(); toast.success('Customer saved'); },
    onError: () => toast.error('Failed to save customer'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4">New Customer</h2>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="grid grid-cols-3 gap-4">
            {[
              { name: 'name', label: 'Full Name / Company *', placeholder: 'Aminata Koroma' },
              { name: 'phone', label: 'Phone', placeholder: '+232 76 000 000' },
              { name: 'email', label: 'Email', placeholder: 'customer@email.com' },
              { name: 'address', label: 'Address', placeholder: 'Freetown, SL' },
              { name: 'creditLimit', label: 'Credit Limit (SLE)', placeholder: '0' },
            ].map((f) => (
              <div key={f.name}>
                <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                <input
                  {...register(f.name as keyof FormValues)}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>
            ))}
            <div className="col-span-3 flex gap-2">
              <LoadingButton type="submit" loading={mutation.isPending} loadingText="Saving…"
                className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium">
                Save Customer
              </LoadingButton>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm border border-slate-200 text-slate-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers…"
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Customer', 'Phone', 'Balance', 'Credit Limit'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={4} className="p-0"><TableSkeleton rows={5} cols={4} /></td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">No customers yet</td></tr>
            ) : customers.map((c: unknown) => {
              const cust = c as Record<string, unknown>;
              const balance = Number(cust['currentBalance'] ?? 0);
              return (
                <tr key={cust['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/10 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-brand-primary" />
                      </div>
                      <span className="font-medium">{cust['name'] as string}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{(cust['phone'] as string) ?? '—'}</td>
                  <td className={cn('px-4 py-3 font-semibold', balance > 0 ? 'text-red-600' : 'text-slate-700')}>
                    {formatCurrency(balance)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(Number(cust['creditLimit'] ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
