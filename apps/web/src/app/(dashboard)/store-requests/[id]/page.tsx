'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, XCircle, Printer, X } from 'lucide-react';
import { api, storeRequestsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';
import { PrintableCollectionNote, type CollectionNoteData } from '@/components/print/PrintableCollectionNote';
import { usePrint, type ReceiptOrg, type ReceiptSettings } from '@/components/print/PrintableReceipt';

interface Line {
  id: string;
  productId: string;
  productName: string | null;
  sku: string | null;
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
  const [showPrint, setShowPrint] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['store-request', id],
    queryFn: () => storeRequestsApi.get(id),
  });

  const { data: orgData }      = useQuery({ queryKey: ['org'],          queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org') });
  const { data: settingsData } = useQuery({ queryKey: ['org-settings'], queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org/settings') });

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
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 capitalize">
            {(sr['status'] as string).replace('_', ' ')}
          </span>
          <button
            onClick={() => setShowPrint(true)}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
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
                  <td className="px-4 py-3">
                    {l.productName ?? l.productId.slice(0, 8)}
                    {l.sku && <span className="text-xs text-slate-400 ml-1.5">{l.sku}</span>}
                  </td>
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

      {showPrint && (
        <CollectionNotePrintModal
          sr={sr}
          sale={sale}
          lines={lines}
          org={orgData?.data}
          settings={settingsData?.data}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

function CollectionNotePrintModal({
  sr, sale, lines, org, settings, onClose,
}: {
  sr: Record<string, unknown>;
  sale?: Record<string, unknown>;
  lines: Line[];
  org?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  onClose: () => void;
}) {
  const print = usePrint();

  const noteOrg: ReceiptOrg = {
    name: String(org?.['name'] ?? 'LEDGERA Business'),
    address: org?.['address'] as string | undefined,
    phone: org?.['phone'] as string | undefined,
    email: org?.['email'] as string | undefined,
    logoUrl: org?.['logoUrl'] as string | undefined,
    tin: org?.['tin'] as string | undefined,
  };

  const noteSettings: ReceiptSettings = {
    showLogoOnReceipt: settings?.['showLogoOnReceipt'] as boolean | undefined,
    showTinOnReceipt: settings?.['showTinOnReceipt'] as boolean | undefined,
  };

  const noteData: CollectionNoteData = {
    storeRequestNumber: String(sr['storeRequestNumber']),
    saleNumber: String(sale?.['saleNumber'] ?? '—'),
    date: String(sr['requestedAt'] ?? new Date().toISOString()),
    expectedCollectionDate: sr['expectedCollectionDate'] as string | undefined,
    status: sr['status'] as string,
    lines: lines.map((l) => ({
      name: l.productName ?? l.productId.slice(0, 8),
      sku: l.sku,
      quantityRequested: Number(l.quantity),
      quantitySupplied: Number(l.suppliedQuantity),
      quantityRemaining: Number(l.quantity) - Number(l.suppliedQuantity) - Number(l.rejectedQuantity),
    })),
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] flex flex-col">
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Collection Note</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PrintableCollectionNote org={noteOrg} settings={noteSettings} note={noteData} />
        </div>
        <div className="no-print p-4 border-t border-slate-100">
          <button
            onClick={() => print()}
            className="w-full flex items-center justify-center gap-2 bg-brand-primary text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-light"
          >
            <Printer className="w-4 h-4" />
            Print Collection Note
          </button>
        </div>
      </div>
    </div>
  );
}
