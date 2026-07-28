'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, XCircle } from 'lucide-react';
import { storeRequestsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';

interface Line {
  id: string;
  productId: string;
  quantity: string;
  requestedUnitPrice: string;
  suppliedQuantity: string;
  rejectedQuantity: string;
}

export default function StoreRequestDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const qc = useQueryClient();
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['store-request', id],
    queryFn: () => storeRequestsApi.get(id),
  });

  const sr = data?.data as Record<string, unknown> | undefined;
  const lines = ((sr?.['lines'] as Line[]) ?? []);
  const sale = sr?.['sale'] as Record<string, unknown> | undefined;
  const supplies = (sr?.['supplies'] as Record<string, unknown>[]) ?? [];
  const rejections = (sr?.['rejections'] as Record<string, unknown>[]) ?? [];

  const remaining = (l: Line) => Number(l.quantity) - Number(l.suppliedQuantity) - Number(l.rejectedQuantity);

  const supplyMutation = useMutation({
    mutationFn: () => {
      const targeted = lines
        .map((l) => ({ storeRequestLineId: l.id, quantity: qtyOverrides[l.id] !== undefined ? Number(qtyOverrides[l.id]) : remaining(l) }))
        .filter((t) => t.quantity > 0);
      return storeRequestsApi.supply(id, { lines: targeted });
    },
    onSuccess: (res) => {
      const repriced = (res.data as Record<string, unknown>)?.['supply']
        ? ((res.data as { supply?: Record<string, unknown> }).supply?.['wasRepriced'] as boolean)
        : false;
      qc.invalidateQueries({ queryKey: ['store-request', id] });
      qc.invalidateQueries({ queryKey: ['store-requests'] });
      setQtyOverrides({});
      toast.success(repriced ? 'Supplied — price was adjusted to current selling price' : 'Supplied');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => storeRequestsApi.reject(id, { reason: rejectReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-request', id] });
      qc.invalidateQueries({ queryKey: ['store-requests'] });
      setShowReject(false);
      setRejectReason('');
      toast.success('Remaining quantity rejected');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading || !sr) {
    return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>;
  }

  const canAct = sr['status'] === 'pending' || sr['status'] === 'partially_supplied';

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={() => router.push('/store-requests' as never)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back to store requests
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-mono">{sr['storeRequestNumber'] as string}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Sale {sale?.['saleNumber'] as string} · Expected collection {formatDate(sr['expectedCollectionDate'] as string)}
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 capitalize">
          {(sr['status'] as string).replace('_', ' ')}
        </span>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Product', 'Requested', 'Supplied', 'Rejected', 'Remaining', canAct ? 'Supply now' : ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lines.map((l) => {
              const rem = remaining(l);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.productId.slice(0, 8)}</td>
                  <td className="px-4 py-3">{l.quantity} @ {formatCurrency(l.requestedUnitPrice)}</td>
                  <td className="px-4 py-3 text-emerald-700">{l.suppliedQuantity}</td>
                  <td className="px-4 py-3 text-red-600">{l.rejectedQuantity}</td>
                  <td className="px-4 py-3 font-semibold">{rem}</td>
                  <td className="px-4 py-3">
                    {canAct && rem > 0 && (
                      <input
                        type="number"
                        min={0}
                        max={rem}
                        step="any"
                        placeholder={String(rem)}
                        value={qtyOverrides[l.id] ?? ''}
                        onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        className="w-20 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canAct && (
        <div className="flex items-center gap-3">
          <LoadingButton
            onClick={() => supplyMutation.mutate()}
            loading={supplyMutation.isPending}
            loadingText="Supplying…"
            className="bg-brand-secondary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
          >
            <PackageCheck className="w-4 h-4" />
            Supply {Object.keys(qtyOverrides).length > 0 ? 'entered quantities' : 'all remaining'}
          </LoadingButton>
          <button
            onClick={() => setShowReject((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50"
          >
            <XCircle className="w-4 h-4" /> Reject remaining
          </button>
        </div>
      )}

      {showReject && (
        <div className="bg-white rounded-xl border border-red-200 p-4 space-y-3">
          <label className="text-xs font-medium text-slate-600 block">Reason (e.g. discontinued, out of stock)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-100"
          />
          <LoadingButton
            onClick={() => rejectMutation.mutate()}
            loading={rejectMutation.isPending}
            disabled={!rejectReason.trim()}
            loadingText="Rejecting…"
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700"
          >
            Confirm rejection
          </LoadingButton>
        </div>
      )}

      {/* History */}
      {(supplies.length > 0 || rejections.length > 0) && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Handover history</h2>
          <div className="space-y-2">
            {supplies.map((s) => (
              <div key={s['id'] as string} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-600">
                  Supplied {formatDate(s['suppliedAt'] as string)}
                  {Boolean(s['wasRepriced']) && (
                    <span className="ml-2 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">repriced</span>
                  )}
                </span>
              </div>
            ))}
            {rejections.map((r) => (
              <div key={r['id'] as string} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-600">Rejected {formatDate(r['rejectedAt'] as string)} — {r['reason'] as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
