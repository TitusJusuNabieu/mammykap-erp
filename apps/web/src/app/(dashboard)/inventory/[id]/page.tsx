'use client';

import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Package, ArrowLeft } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary';

export default function ProductDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<{ data: Record<string, unknown> }>(`/v1/products/${id}`),
  });

  const { data: movData } = useQuery({
    queryKey: ['product-movements', id],
    queryFn: () => api.get<{ data: unknown[] }>(`/v1/products/${id}/movements`),
  });

  const product = data?.data;
  const movements = movData?.data ?? [];

  const { register, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm<Record<string, unknown>>();

  useEffect(() => {
    if (product) {
      reset({
        name:         product['name'],
        costPrice:    Number(product['costPrice']),
        sellingPrice: Number(product['sellingPrice']),
        taxRate:      Number(product['taxRate']),
        reorderPoint: Number(product['reorderPoint']),
        description:  product['description'],
      });
    }
  }, [product, reset]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/v1/products/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!product) return <div className="text-slate-400 text-sm p-6">Product not found</div>;

  const stockLevels = (product['stockLevels'] as unknown[]) ?? [];

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/inventory')} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-primary/10 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{product['name'] as string}</h1>
            <p className="text-xs text-slate-400 font-mono">{(product['sku'] as string) ?? 'No SKU'}</p>
          </div>
        </div>
      </div>

      {/* Stock levels */}
      {stockLevels.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Current Stock</h2>
          <div className="grid grid-cols-3 gap-3">
            {stockLevels.map((sl: unknown) => {
              const level = sl as Record<string, unknown>;
              return (
                <div key={level['id'] as string} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Branch</p>
                  <p className="text-lg font-bold text-slate-900">{Number(level['quantity']).toFixed(0)}</p>
                  <p className="text-xs text-slate-400">avg cost: {formatCurrency(Number(level['avgCost']))}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit form */}
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Edit Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600 block mb-1">Product Name</label>
            <input {...register('name')} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Cost Price (SLE)</label>
            <input {...register('costPrice')} type="number" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Selling Price (SLE)</label>
            <input {...register('sellingPrice')} type="number" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Tax Rate (%)</label>
            <input {...register('taxRate')} type="number" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Reorder Point</label>
            <input {...register('reorderPoint')} type="number" className={inputCls} />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-xs text-red-600">{(mutation.error as Error).message}</p>
        )}
        {mutation.isSuccess && (
          <p className="text-xs text-emerald-600">Saved successfully</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={!isDirty || isSubmitting}
            className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button"
            onClick={() => mutation.mutate({ isActive: !product['isActive'] })}
            className={cn('px-4 py-2 rounded-lg text-sm border', product['isActive'] ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50')}>
            {product['isActive'] ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </form>

      {/* Movement history */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-slate-900">Stock Movements</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Date', 'Type', 'Qty', 'Unit Cost', 'After'].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {movements.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-slate-400 text-xs">No movements yet</td></tr>
            ) : movements.map((m: unknown) => {
              const mv = m as Record<string, unknown>;
              const qty = Number(mv['quantity']);
              return (
                <tr key={mv['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 text-xs">{formatDate(mv['createdAt'] as string)}</td>
                  <td className="px-4 py-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      qty > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                      {mv['movementType'] as string}
                    </span>
                  </td>
                  <td className={cn('px-4 py-2 font-semibold text-sm', qty > 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {qty > 0 ? '+' : ''}{qty}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatCurrency(Number(mv['unitCost']))}</td>
                  <td className="px-4 py-2 text-slate-700">{Number(mv['quantityAfter']).toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
