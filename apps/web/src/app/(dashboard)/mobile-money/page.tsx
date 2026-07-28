'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Smartphone, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary/30';

const PROVIDERS = ['orange_money', 'afrimoney', 'qmoney'] as const;
type Provider = (typeof PROVIDERS)[number];

const providerLabel: Record<Provider, string> = {
  orange_money: 'Orange Money',
  afrimoney: 'Afrimoney',
  qmoney: 'QMoney',
};

const providerColor: Record<Provider, string> = {
  orange_money: 'bg-orange-50 text-orange-700',
  afrimoney: 'bg-blue-50 text-blue-700',
  qmoney: 'bg-purple-50 text-purple-700',
};

type Wallet = {
  id: string;
  provider: Provider;
  phoneNumber: string;
  accountName: string;
  currentBalance: string;
  currency: string;
};

type MomoTx = {
  id: string;
  type: string;
  amount: string;
  fee: string;
  description: string;
  reference: string;
  transactionDate: string;
};

export default function MobileMoneyPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewWallet, setShowNewWallet] = useState(false);
  const [showNewTx, setShowNewTx] = useState(false);

  const { data: walletsData } = useQuery({
    queryKey: ['momo-wallets'],
    queryFn: () => api.get<{ data: Wallet[] }>('/v1/momo-wallets'),
  });

  const { data: txData } = useQuery({
    queryKey: ['momo-transactions', selectedId],
    queryFn: () => api.get<{ data: MomoTx[] }>(`/v1/momo-wallets/${selectedId}/transactions`),
    enabled: !!selectedId,
  });

  const wallets = walletsData?.data ?? [];
  const txs = txData?.data ?? [];
  const selected = wallets.find((w) => w.id === selectedId);

  const walletForm = useForm({ defaultValues: { provider: 'orange_money', phoneNumber: '', accountName: '', currency: 'SLE' } });
  const txForm = useForm({ defaultValues: { type: 'receive', amount: '', fee: '0', description: '', reference: '', transactionDate: new Date().toISOString().slice(0, 10) } });

  const walletMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ data: Wallet }>('/v1/momo-wallets', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['momo-wallets'] });
      setShowNewWallet(false);
      walletForm.reset();
      toast.success('Wallet added');
    },
    onError: () => toast.error('Failed to add wallet'),
  });

  const txMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/v1/momo-wallets/${selectedId}/transactions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['momo-transactions', selectedId] });
      qc.invalidateQueries({ queryKey: ['momo-wallets'] });
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
          <Smartphone className="w-5 h-5 text-brand-primary" />
          <h1 className="text-xl font-bold text-slate-900">Mobile Money</h1>
        </div>
        <button
          onClick={() => setShowNewWallet((v) => !v)}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light"
        >
          <Plus className="w-4 h-4" /> Add Wallet
        </button>
      </div>

      {showNewWallet && (
        <form
          onSubmit={walletForm.handleSubmit((d) => walletMutation.mutate(d as Record<string, unknown>))}
          className="bg-white rounded-xl border border-border p-5 shadow-sm grid grid-cols-4 gap-4"
        >
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Provider</label>
            <select {...walletForm.register('provider')} className={cn(inputCls, 'bg-white')}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{providerLabel[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Phone Number</label>
            <input {...walletForm.register('phoneNumber')} placeholder="+23276000000" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Account Name</label>
            <input {...walletForm.register('accountName')} placeholder="Business name" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Currency</label>
            <input {...walletForm.register('currency')} placeholder="SLE" className={inputCls} />
          </div>
          <div className="col-span-4 flex gap-3">
            <LoadingButton type="submit" loading={walletMutation.isPending} loadingText="Saving…"
              className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
              Add Wallet
            </LoadingButton>
            <button type="button" onClick={() => setShowNewWallet(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Wallet cards */}
        <div className="space-y-3">
          {wallets.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-8 text-center text-slate-400 text-sm shadow-sm">
              <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No wallets yet
            </div>
          ) : wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className={cn(
                'w-full text-left bg-white rounded-xl border p-4 shadow-sm transition-colors',
                selectedId === w.id ? 'border-brand-primary ring-1 ring-brand-primary/20' : 'border-border hover:border-slate-300',
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', providerColor[w.provider])}>
                  {providerLabel[w.provider]}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900">{w.accountName}</p>
              <p className="text-xs font-mono text-slate-400">{w.phoneNumber}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(Number(w.currentBalance))}</p>
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div className="col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center text-slate-400 shadow-sm">
              <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Select a wallet to view transactions</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', providerColor[selected.provider])}>
                    {providerLabel[selected.provider]}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selected.accountName}</p>
                    <p className="text-xs text-slate-400">Balance: {formatCurrency(Number(selected.currentBalance))}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewTx((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-sm text-brand-primary border border-brand-primary/30 px-3 py-1.5 rounded-lg hover:bg-brand-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" /> Record
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
                      <option value="receive">Receive</option>
                      <option value="send">Send</option>
                      <option value="fee">Fee</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Amount</label>
                    <input {...txForm.register('amount')} type="number" step="0.01" placeholder="0.00" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Fee</label>
                    <input {...txForm.register('fee')} type="number" step="0.01" placeholder="0.00" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
                    <input {...txForm.register('transactionDate')} type="date" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Reference</label>
                    <input {...txForm.register('reference')} placeholder="Ref #" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                    <input {...txForm.register('description')} placeholder="Notes" className={inputCls} />
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
                    {['Date', 'Type', 'Description', 'Fee', 'Amount'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {txs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-xs">No transactions yet</td></tr>
                  ) : txs.map((tx) => {
                    const isIn = tx.type === 'receive';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(tx.transactionDate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {isIn
                              ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                              : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
                            <span className="text-xs capitalize">{tx.type}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{tx.description}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{Number(tx.fee) > 0 ? formatCurrency(Number(tx.fee)) : '—'}</td>
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
