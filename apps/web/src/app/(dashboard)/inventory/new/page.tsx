'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name:           z.string().min(1, 'Name required'),
  sku:            z.string().optional(),
  barcode:        z.string().optional(),
  categoryId:     z.string().uuid().optional().or(z.literal('')),
  costPrice:      z.coerce.number().min(0),
  sellingPrice:   z.coerce.number().min(0),
  taxRate:        z.coerce.number().min(0).max(100),
  isTaxable:      z.boolean(),
  trackInventory: z.boolean(),
  hasExpiry:      z.boolean(),
  reorderPoint:   z.coerce.number().min(0),
  description:    z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const Field = ({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary';

export default function NewProductPage() {
  const router = useRouter();

  const { data: catsData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ data: unknown[] }>('/v1/categories'),
  });
  const categories = catsData?.data ?? [];

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      trackInventory: true,
      isTaxable: false,
      hasExpiry: false,
      taxRate: 0,
      reorderPoint: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (body: FormValues) =>
      api.post<{ data: { id: string } }>('/v1/products', {
        ...body,
        categoryId: body.categoryId || undefined,
      }),
    onSuccess: (res) => {
      router.push(`/inventory/${(res as { data: { id: string } }).data.id}`);
    },
  });

  const isTaxable = watch('isTaxable');

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700">← Back</button>
        <h1 className="text-xl font-bold text-slate-900">Add Product</h1>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        {/* Basic info */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Product Name *" error={errors.name?.message}>
                <input {...register('name')} placeholder="e.g. Panadol 500mg" className={cn(inputCls, errors.name && 'border-red-300')} />
              </Field>
            </div>
            <Field label="SKU">
              <input {...register('sku')} placeholder="e.g. PAN-500" className={inputCls} />
            </Field>
            <Field label="Barcode">
              <input {...register('barcode')} placeholder="Scan or type barcode" className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="Category">
                <select {...register('categoryId')} className={cn(inputCls, 'bg-white')}>
                  <option value="">— No category —</option>
                  {categories.map((c: unknown) => {
                    const cat = c as Record<string, unknown>;
                    return <option key={cat['id'] as string} value={cat['id'] as string}>{cat['name'] as string}</option>;
                  })}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea {...register('description')} rows={2} placeholder="Optional description…"
                className={cn(inputCls, 'resize-none col-span-2')} />
            </Field>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Pricing</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cost Price (SLE) *" error={errors.costPrice?.message}>
              <input {...register('costPrice')} type="number" step="0.01" min="0" placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="Selling Price (SLE) *" error={errors.sellingPrice?.message}>
              <input {...register('sellingPrice')} type="number" step="0.01" min="0" placeholder="0.00" className={inputCls} />
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('isTaxable')} className="w-4 h-4 accent-brand-primary" />
                <span className="text-sm text-slate-700">Taxable</span>
              </label>
            </div>
            {isTaxable && (
              <Field label="Tax Rate (%)">
                <input {...register('taxRate')} type="number" step="0.01" min="0" max="100" placeholder="15" className={inputCls} />
              </Field>
            )}
          </div>
        </div>

        {/* Inventory */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Inventory Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reorder Point (qty)">
              <input {...register('reorderPoint')} type="number" min="0" placeholder="0" className={inputCls} />
            </Field>
            <div className="space-y-2 pt-5">
              {[
                { name: 'trackInventory', label: 'Track inventory' },
                { name: 'hasExpiry',      label: 'Track expiry dates' },
              ].map((opt) => (
                <label key={opt.name} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register(opt.name as keyof FormValues)} className="w-4 h-4 accent-brand-primary" />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {mutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {(mutation.error as Error).message}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isSubmitting}
            className="bg-brand-primary text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-light disabled:opacity-60">
            {isSubmitting ? 'Saving…' : 'Save Product'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:border-slate-300">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
