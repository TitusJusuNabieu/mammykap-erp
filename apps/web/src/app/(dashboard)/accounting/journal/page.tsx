'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, today, cn } from '@/lib/utils';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const lineSchema = z.object({
  accountId:   z.string().uuid('Select account'),
  description: z.string().optional(),
  debit:       z.coerce.number().min(0),
  credit:      z.coerce.number().min(0),
});

const jeSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1, 'Description required'),
  lines:       z.array(lineSchema).min(2, 'At least 2 lines required'),
});

type JEForm = z.infer<typeof jeSchema>;

const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary/30';

export default function JournalPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const qc = useQueryClient();

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const t = today();

  const { data: jeData, isLoading } = useQuery({
    queryKey: ['journal'],
    queryFn: () => api.get<{ data: unknown[] }>(`/v1/journal?from=${yearStart}&to=${t}&limit=100`),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/accounts'),
  });

  const { data: entryData } = useQuery({
    queryKey: ['journal-entry', selectedEntry],
    queryFn: () => api.get<{ data: unknown }>(`/v1/journal/${selectedEntry}`),
    enabled: !!selectedEntry,
  });

  const entries = jeData?.data ?? [];
  const allAccounts = flattenTree((accountsData?.data ?? []) as Array<Record<string, unknown>>);

  const { register, handleSubmit, control, watch, reset, formState: { errors, isSubmitting } } = useForm<JEForm>({
    resolver: zodResolver(jeSchema),
    defaultValues: {
      date: t,
      lines: [
        { accountId: '', description: '', debit: 0, credit: 0 },
        { accountId: '', description: '', debit: 0, credit: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const lines = watch('lines');
  const totalDR = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCR = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDR - totalCR) < 0.01;

  const mutation = useMutation({
    mutationFn: (body: JEForm) => api.post('/v1/journal', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      setShowNew(false);
      reset();
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/v1/journal/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      setSelectedEntry(null);
    },
  });

  const selectedEntryData = (entryData as { data: Record<string, unknown> } | undefined)?.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-primary" />
          <h1 className="text-xl font-bold text-slate-900">Journal Entries</h1>
        </div>
        <button
          onClick={() => { setShowNew((v) => !v); setSelectedEntry(null); }}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* New entry form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">New Journal Entry</h2>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
                <input {...register('date')} type="date" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Description *</label>
                <input {...register('description')} placeholder="Purpose of this entry…" className={cn(inputCls, errors.description && 'border-red-300')} />
              </div>
            </div>

            {/* Lines table */}
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="bg-slate-50 border border-slate-200 rounded-lg">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-2/5">Account</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Memo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">Debit</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">Credit</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.id} className="border-b border-slate-50">
                    <td className="px-2 py-1.5">
                      <select {...register(`lines.${i}.accountId`)} className={cn(inputCls, 'bg-white')}>
                        <option value="">— Select —</option>
                        {allAccounts.map((a) => (
                          <option key={a['id'] as string} value={a['id'] as string}>
                            {a['code'] as string} — {a['name'] as string}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input {...register(`lines.${i}.description`)} placeholder="Optional memo" className={inputCls} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input {...register(`lines.${i}.debit`)} type="number" step="0.01" min="0" placeholder="0.00"
                        className={cn(inputCls, 'text-right')} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input {...register(`lines.${i}.credit`)} type="number" step="0.01" min="0" placeholder="0.00"
                        className={cn(inputCls, 'text-right')} />
                    </td>
                    <td className="px-1">
                      {fields.length > 2 && (
                        <button type="button" onClick={() => remove(i)} className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={cn('border-t-2', isBalanced ? 'border-emerald-300' : 'border-red-300')}>
                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold">
                    <span className={isBalanced ? 'text-emerald-600' : 'text-red-600'}>
                      {isBalanced ? 'Balanced' : 'NOT balanced'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totalDR)}</td>
                  <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totalCR)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => append({ accountId: '', description: '', debit: 0, credit: 0 })}
                className="text-xs text-brand-primary hover:underline"
              >
                + Add line
              </button>
              <div className="flex-1" />
              {mutation.isError && (
                <p className="text-xs text-red-600">{(mutation.error as Error).message}</p>
              )}
              <button type="button" onClick={() => setShowNew(false)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
              <button type="submit" disabled={!isBalanced || isSubmitting}
                className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
                {isSubmitting ? 'Posting…' : 'Post Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-5 gap-5">
        {/* Entry list */}
        <div className="col-span-3 bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {['Entry #', 'Date', 'Description', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No journal entries yet</td></tr>
              ) : entries.map((e: unknown) => {
                const entry = e as Record<string, unknown>;
                const isSelected = selectedEntry === entry['id'];
                return (
                  <tr key={entry['id'] as string}
                    onClick={() => setSelectedEntry(isSelected ? null : entry['id'] as string)}
                    className={cn('cursor-pointer transition-colors', isSelected ? 'bg-brand-primary/5' : 'hover:bg-slate-50')}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-brand-primary">{entry['entryNumber'] as string}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(entry['date'] as string)}</td>
                    <td className="px-4 py-3 text-slate-700 text-xs truncate max-w-[180px]">{entry['description'] as string}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        entry['status'] === 'posted' ? 'bg-emerald-50 text-emerald-700' :
                        entry['status'] === 'voided' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600')}>
                        {entry['status'] as string}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Eye className="w-3.5 h-3.5 text-slate-300" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Entry detail */}
        <div className="col-span-2">
          {selectedEntryData ? (
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-slate-50">
                <p className="font-mono text-sm font-bold text-brand-primary">{selectedEntryData['entryNumber'] as string}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selectedEntryData['description'] as string}</p>
                <p className="text-xs text-slate-400">{formatDate(selectedEntryData['date'] as string)}</p>
              </div>
              <div className="divide-y divide-slate-50">
                {((selectedEntryData['lines'] as unknown[]) ?? []).map((l: unknown) => {
                  const line = l as Record<string, unknown>;
                  return (
                    <div key={line['id'] as string} className="flex justify-between items-center px-5 py-2.5 text-xs">
                      <div>
                        <p className="text-slate-700 font-medium">{line['accountId'] as string}</p>
                        {Boolean(line['description']) && <p className="text-slate-400">{line['description'] as string}</p>}
                      </div>
                      <div className="text-right">
                        {Number(line['debit']) > 0 && <p className="text-slate-900 font-semibold">DR {formatCurrency(Number(line['debit']))}</p>}
                        {Number(line['credit']) > 0 && <p className="text-slate-500">CR {formatCurrency(Number(line['credit']))}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between px-5 py-3 bg-slate-50 text-xs font-semibold">
                <span>DR {formatCurrency(Number(selectedEntryData['totalDebit']))}</span>
                <span>CR {formatCurrency(Number(selectedEntryData['totalCredit']))}</span>
              </div>
              {selectedEntryData['status'] === 'posted' && (
                <div className="px-5 py-3 border-t border-border">
                  <button
                    onClick={() => {
                      const reason = window.prompt('Reason for voiding:');
                      if (reason) voidMutation.mutate({ id: selectedEntryData['id'] as string, reason });
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Void this entry…
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border p-8 text-center text-slate-400 text-sm shadow-sm">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
              Click an entry to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function flattenTree(nodes: Array<Record<string, unknown>>, depth = 0): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    result.push({ ...node, _depth: depth });
    if (Array.isArray(node['children'])) {
      result.push(...flattenTree(node['children'] as Array<Record<string, unknown>>, depth + 1));
    }
  }
  return result;
}
