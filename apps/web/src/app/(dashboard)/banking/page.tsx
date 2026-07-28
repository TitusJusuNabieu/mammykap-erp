'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Building2, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary/30';

type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  currentBalance: string;
};

type BankTx = {
  id: string;
  type: string;
  amount: string;
  description: string;
  reference: string;
  transactionDate: string;
};

export default function BankingPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewTx, setShowNewTx] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get<{ data: BankAccount[] }>('/v1/bank-accounts'),
  });

  const { data: txData } = useQuery({
    queryKey: ['bank-transactions', selectedId],
    queryFn: () => api.get<{ data: BankTx[] }>(`/v1/bank-accounts/${selectedId}/transactions`),
    enabled: !!selectedId,
  });

  const accounts = accountsData?.data ?? [];
  const txs = txData?.data ?? [];
  const selected = accounts.find((a) => a.id === selectedId);

  const acctForm = useForm({ defaultValues: { name: '', bankName: '', accountNumber: '', currency: 'SLE' } });
  const txForm = useForm({ defaultValues: { type: 'deposit', amount: '', description: '', reference: '', transactionDate: new Date().toISOString().slice(0, 10) } });

  const acctMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ data: BankAccount }>('/v1/bank-accounts', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowNewAccount(false);
      acctForm.reset();
      toast.success('Bank account added');
    },
    onError: () => toast.error('Failed to add bank account'),
  });

  const txMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/v1/bank-accounts/${selectedId}/transactions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions', selectedId] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowNewTx(false);
      txForm.reset();
      toast.success('Transaction recorded');
    },
    onError: () => toast.error('Failed to record transaction'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-brand-primary" />
          <h1 className="text-xl font-bold text-slate-900">Banking</h1>
        </div>
        <button
          onClick={() => setShowNewAccount((v) => !v)}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light"
        >
          <Plus className="w-4 h-4" /> Add Bank Account
        </button>
      </div>

      {showNewAccount && (
        <form
          onSubmit={acctForm.handleSubmit((d) => acctMutation.mutate(d as Record<string, unknown>))}
          className="bg-white rounded-xl border border-border p-5 shadow-sm grid grid-cols-4 gap-4"
        >
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Account Label</label>
            <input {...acctForm.register('name')} placeholder="e.g. Main Checking" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Bank Name</label>
            <input {...acctForm.register('bankName')} placeholder="e.g. SLCB" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Account Number</label>
            <input {...acctForm.register('accountNumber')} placeholder="1234567890" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Currency</label>
            <input {...acctForm.register('currency')} placeholder="SLE" className={inputCls} />
          </div>
          <div className="col-span-4 flex gap-3">
            <LoadingButton type="submit" loading={acctMutation.isPending} loadingText="Saving…"
              className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
              Create Account
            </LoadingButton>
            <button type="button" onClick={() => setShowNewAccount(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Account list */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-8 text-center text-slate-400 text-sm shadow-sm">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No bank accounts yet
            </div>
          ) : accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={cn(
                'w-full text-left bg-white rounded-xl border p-4 shadow-sm transition-colors',
                selectedId === a.id ? 'border-brand-primary ring-1 ring-brand-primary/20' : 'border-border hover:border-slate-300',
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.bankName}</p>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{a.accountNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(Number(a.currentBalance))}</p>
                  <p className="text-xs text-slate-400">{a.currency}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Transaction list */}
        <div className="col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center text-slate-400 shadow-sm">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Select an account to view transactions</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selected.name}</p>
                  <p className="text-xs text-slate-400">Balance: {formatCurrency(Number(selected.currentBalance))}</p>
                </div>
                <button
                  onClick={() => setShowNewTx((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-sm text-brand-primary border border-brand-primary/30 px-3 py-1.5 rounded-lg hover:bg-brand-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" /> Record Transaction
                </button>
              </div>

              {showNewTx && (
                <form
                  onSubmit={txForm.handleSubmit((d) => txMutation.mutate(d as Record<string, unknown>))}
                  className="px-5 py-4 border-b border-border bg-slate-50 grid grid-cols-3 gap-3"
                >
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                    <select {...txForm.register('type')} className={cn(inputCls, 'bg-white')}>
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                      <option value="charge">Bank Charge</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Amount (SLE)</label>
                    <input {...txForm.register('amount')} type="number" step="0.01" placeholder="0.00" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
                    <input {...txForm.register('transactionDate')} type="date" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Reference</label>
                    <input {...txForm.register('reference')} placeholder="Ref #" className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                    <input {...txForm.register('description')} placeholder="What was this for?" className={inputCls} />
                  </div>
                  <div className="col-span-3 flex gap-2">
                    <LoadingButton type="submit" loading={txMutation.isPending} loadingText="Saving…"
                      className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
                      Record
                    </LoadingButton>
                    <button type="button" onClick={() => setShowNewTx(false)}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
                  </div>
                </form>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    {['Date', 'Type', 'Description', 'Amount'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {txs.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-xs">No transactions yet</td></tr>
                  ) : txs.map((tx) => {
                    const isIn = tx.type === 'deposit';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(tx.transactionDate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {isIn
                              ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                              : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
                            <span className="text-xs capitalize">{tx.type.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{tx.description}</td>
                        <td className={cn('px-4 py-3 text-sm font-semibold', isIn ? 'text-emerald-700' : 'text-red-600')}>
                          {isIn ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
