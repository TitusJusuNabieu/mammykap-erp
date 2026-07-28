'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck, Clock } from 'lucide-react';
import { storeRequestsApi } from '@/lib/api';
import { formatDate, cn, today } from '@/lib/utils';

type StatusFilter = 'pending' | 'partially_supplied' | 'supplied' | 'rejected';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  partially_supplied: 'Partially Supplied',
  supplied: 'Supplied',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  partially_supplied: 'bg-blue-50 text-blue-700',
  supplied: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function StoreRequestsPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['store-requests', status],
    queryFn: () => storeRequestsApi.list({ status }),
  });

  const rows = (data?.data ?? []) as Record<string, unknown>[];
  const todayStr = today();

  const TABS: { id: StatusFilter; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'partially_supplied', label: 'Partially Supplied' },
    { id: 'supplied', label: 'Supplied' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Store Requests</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Goods requested at the sales desk, waiting for the store to hand them over.
        </p>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStatus(t.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              status === t.id ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700',
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
              {['Number', 'Sale', 'Expected Collection', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => {
              const overdue = status !== 'supplied' && status !== 'rejected'
                && String(r['expectedCollectionDate']) < todayStr;
              return (
                <tr key={r['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{r['storeRequestNumber'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{(r['saleId'] as string)?.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('flex items-center gap-1.5', overdue && 'text-red-600 font-medium')}>
                      {overdue && <Clock className="w-3.5 h-3.5" />}
                      {formatDate(r['expectedCollectionDate'] as string)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded-full font-medium', STATUS_COLORS[r['status'] as string])}>
                      {STATUS_LABELS[r['status'] as string] ?? (r['status'] as string)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/store-requests/${r['id']}` as never}
                      className="text-brand-primary text-xs font-medium hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nothing {(STATUS_LABELS[status] ?? status).toLowerCase()}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
