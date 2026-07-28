'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { dailyCloseApi } from '@/lib/api';
import { formatDate, today } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingButton } from '@/components/ui/spinner';

export default function DailyClosePage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['daily-close-status'],
    queryFn: () => dailyCloseApi.status(),
  });

  const status = data?.data;

  const closeMutation = useMutation({
    mutationFn: () => dailyCloseApi.close({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-close-status'] });
      toast.success('Day closed and balanced');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading || !status) {
    return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>;
  }

  const alreadyClosed = Boolean(status['alreadyClosed']);
  const canClose = Boolean(status['canClose']);
  const unresolved = (status['unresolvedRequests'] as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Daily Close</h1>
        <p className="text-sm text-slate-500 mt-0.5">{formatDate(today())} — your sales must balance against goods actually supplied before you can close.</p>
      </div>

      {alreadyClosed ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Day already closed</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Closed at {status['closedAt'] ? new Date(status['closedAt'] as string).toLocaleTimeString() : '—'}
            </p>
          </div>
        </div>
      ) : canClose ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">Everything balances</p>
              <p className="text-sm text-slate-500 mt-0.5">All your sales today have their goods accounted for.</p>
            </div>
          </div>
          <LoadingButton
            onClick={() => closeMutation.mutate()}
            loading={closeMutation.isPending}
            loadingText="Closing…"
            className="bg-brand-secondary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110"
          >
            <Lock className="w-4 h-4" />
            Close &amp; balance the day
          </LoadingButton>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Can&rsquo;t close yet — {unresolved.length} sale(s) still awaiting goods supply</p>
              <p className="text-sm text-amber-700 mt-0.5">
                These were due for collection today or earlier but the store hasn&rsquo;t supplied them. Resolve each one, then come back here.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-amber-100 divide-y divide-amber-50">
            {unresolved.map((u) => (
              <Link
                key={u['storeRequestId'] as string}
                href={`/store-requests/${u['storeRequestId']}` as never}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-amber-50/50"
              >
                <div>
                  <p className="font-mono text-xs text-slate-500">{u['storeRequestNumber'] as string}</p>
                  <p className="text-slate-700">Sale {u['saleNumber'] as string}</p>
                </div>
                <span className="text-xs text-amber-700">
                  Due {formatDate(u['expectedCollectionDate'] as string)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
