'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft, Eye } from 'lucide-react';
import { api, quotesApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { PrintableInvoice, type InvoiceData, type InvoiceOrg, type InvoiceSettings } from '@/components/print/PrintableInvoice';
import { usePrint } from '@/components/print/PrintableReceipt';

const lineSchema = z.object({
  description: z.string().min(1, 'Required'),
  quantity:    z.coerce.number().positive('Must be > 0'),
  unitPrice:   z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100),
  taxRate:     z.coerce.number().min(0).max(100),
});

const schema = z.object({
  type:            z.enum(['quotation', 'proforma_invoice', 'tax_invoice']),
  date:            z.string().min(1, 'Required'),
  expiryDate:      z.string().optional(),
  dueDate:         z.string().optional(),
  customerName:    z.string().optional(),
  customerEmail:   z.string().email('Invalid email').optional().or(z.literal('')),
  customerPhone:   z.string().optional(),
  customerAddress: z.string().optional(),
  notes:           z.string().optional(),
  terms:           z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type FormValues = z.infer<typeof schema>;

function calcLine(q: number, up: number, disc: number, tax: number) {
  const gross    = q * up;
  const discAmt  = gross * (disc / 100);
  const after    = gross - discAmt;
  const taxAmt   = after * (tax / 100);
  return { gross, discAmt, taxAmt, total: after + taxAmt };
}

export default function NewQuotePage() {
  const router  = useRouter();
  const print   = usePrint();
  const [preview, setPreview] = useState(false);

  const { data: orgData }      = useQuery({ queryKey: ['org'],          queryFn: () => api.get<{ data: unknown }>('/v1/org') });
  const { data: settingsData } = useQuery({ queryKey: ['org-settings'], queryFn: () => api.get<{ data: unknown }>('/v1/org/settings') });

  const org      = (orgData      as { data: Record<string, unknown> } | undefined)?.data;
  const settings = (settingsData as { data: Record<string, unknown> } | undefined)?.data;

  const today = new Date().toISOString().slice(0, 10);
  const in30d = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  const { control, register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type:       'quotation',
      date:       today,
      expiryDate: in30d,
      lines:      [{ description: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const values = watch();

  const totals = values.lines.reduce(
    (acc, l) => {
      const { discAmt, taxAmt, total } = calcLine(Number(l.quantity) || 0, Number(l.unitPrice) || 0, Number(l.discountPct) || 0, Number(l.taxRate) || 0);
      acc.discount += discAmt;
      acc.tax      += taxAmt;
      acc.total    += total;
      return acc;
    },
    { discount: 0, tax: 0, total: 0 },
  );
  const subtotal = totals.total - totals.tax;

  const createMutation = useMutation({
    mutationFn: (body: unknown) => quotesApi.create(body),
    onSuccess: () => router.push('/sales/quotes'),
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({
      ...data,
      lines: data.lines.map((l, i) => ({ ...l, sortOrder: i })),
    });
  };

  const invoiceOrg: InvoiceOrg = {
    name:               String(org?.['name'] ?? 'Your Business'),
    address:            org?.['address'] as string | undefined,
    phone:              org?.['phone'] as string | undefined,
    email:              org?.['email'] as string | undefined,
    logoUrl:            org?.['logoUrl'] as string | undefined,
    tin:                org?.['tin'] as string | undefined,
    registrationNumber: org?.['registrationNumber'] as string | undefined,
  };

  const invoiceSettings: InvoiceSettings = {
    showLogo:    Boolean(settings?.['showLogoOnInvoice'] ?? true),
    showTin:     Boolean(settings?.['showTinOnInvoice'] ?? true),
    footerText:  settings?.['invoiceFooterText'] as string | undefined,
    terms:       values.terms || (settings?.['invoiceTerms'] as string | undefined),
    bankDetails: settings?.['invoiceBankDetails'] as string | undefined,
  };

  const previewData: InvoiceData = {
    id:             'PREVIEW',
    invoiceNumber:  values.type === 'quotation' ? 'QUO-000001' : values.type === 'proforma_invoice' ? 'PRO-000001' : 'INV-000001',
    date:           values.date,
    dueDate:        values.dueDate,
    status:         'draft',
    customer: {
      name:    values.customerName || 'Customer Name',
      email:   values.customerEmail,
      phone:   values.customerPhone,
      address: values.customerAddress,
    },
    lines: values.lines.map((l) => ({
      description: l.description || 'Item',
      quantity:    Number(l.quantity) || 1,
      unitPrice:   Number(l.unitPrice) || 0,
      discountPct: Number(l.discountPct) || 0,
      taxRate:     Number(l.taxRate) || 0,
      lineTotal:   calcLine(Number(l.quantity) || 0, Number(l.unitPrice) || 0, Number(l.discountPct) || 0, Number(l.taxRate) || 0).total,
    })),
    subtotal,
    discountAmount: totals.discount,
    taxAmount:      totals.tax,
    totalAmount:    totals.total,
    amountPaid:     0,
    amountDue:      totals.total,
    notes:          values.notes,
    payments:       [],
  };

  const docTitle = values.type === 'quotation' ? 'QUOTATION' : values.type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'TAX INVOICE';

  const inputCls = (err?: { message?: string }) => cn(
    'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors',
    'focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
    err ? 'border-red-300 bg-red-50' : 'border-slate-300',
  );

  if (preview) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between no-print">
          <button onClick={() => setPreview(false)} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Back to form
          </button>
          <div className="flex gap-2">
            <button onClick={() => print('invoice-print-area')} className="flex items-center gap-1.5 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors">
              Print / Save PDF
            </button>
            <button onClick={handleSubmit(onSubmit)} disabled={createMutation.isPending} className="flex items-center gap-1.5 px-4 py-2 bg-brand-secondary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
              {createMutation.isPending ? 'Saving…' : 'Save Document'}
            </button>
          </div>
        </div>
        <PrintableInvoice data={previewData} org={invoiceOrg} settings={invoiceSettings} docTitle={docTitle} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">New Document</h1>
            <p className="text-slate-500 text-sm mt-0.5">Create a quotation or invoice for your customer</p>
          </div>
        </div>
        <button onClick={() => setPreview(true)} className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          <Eye className="w-4 h-4" /> Preview
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Document type & dates */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Document Details</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Document type</label>
              <select {...register('type')} className={inputCls()}>
                <option value="quotation">Quotation</option>
                <option value="proforma_invoice">Proforma Invoice</option>
                <option value="tax_invoice">Tax Invoice</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Date</label>
              <input type="date" {...register('date')} className={inputCls(errors.date)} />
              {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Valid until</label>
              <input type="date" {...register('expiryDate')} className={inputCls()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Due date</label>
              <input type="date" {...register('dueDate')} className={inputCls()} />
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Bill To</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Customer / Company name</label>
              <input {...register('customerName')} placeholder="Koroma Trading Co." className={inputCls()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
              <input type="email" {...register('customerEmail')} placeholder="customer@example.com" className={inputCls(errors.customerEmail)} />
              {errors.customerEmail && <p className="text-xs text-red-600 mt-1">{errors.customerEmail.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label>
              <input {...register('customerPhone')} placeholder="+232 76 123 456" className={inputCls()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Address</label>
              <input {...register('customerAddress')} placeholder="Freetown, Sierra Leone" className={inputCls()} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Items</h2>
            <button
              type="button"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 0 })}
              className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-brand-light transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add line
            </button>
          </div>

          {/* Table header */}
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 pb-1 border-b border-slate-100">
            <div className="col-span-4">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-1 text-right">Disc %</div>
            <div className="col-span-1 text-right">Tax %</div>
            <div className="col-span-2 text-right">Total</div>
          </div>

          <div className="space-y-3">
            {fields.map((field, i) => {
              const l = values.lines[i] ?? { quantity: 0, unitPrice: 0, discountPct: 0, taxRate: 0 };
              const { total } = calcLine(Number(l.quantity) || 0, Number(l.unitPrice) || 0, Number(l.discountPct) || 0, Number(l.taxRate) || 0);
              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-4">
                    <input
                      {...register(`lines.${i}.description`)}
                      placeholder="Item description…"
                      className={inputCls(errors.lines?.[i]?.description)}
                    />
                    {errors.lines?.[i]?.description && (
                      <p className="text-xs text-red-600 mt-0.5">{errors.lines[i]!.description!.message}</p>
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <input type="number" step="0.01" {...register(`lines.${i}.quantity`)} placeholder="1" className={cn(inputCls(), 'text-right')} />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <input type="number" step="0.01" {...register(`lines.${i}.unitPrice`)} placeholder="0.00" className={cn(inputCls(), 'text-right')} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <input type="number" step="0.1" max="100" {...register(`lines.${i}.discountPct`)} placeholder="0" className={cn(inputCls(), 'text-right')} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <input type="number" step="0.1" max="100" {...register(`lines.${i}.taxRate`)} placeholder="0" className={cn(inputCls(), 'text-right')} />
                  </div>
                  <div className="col-span-10 md:col-span-2 flex items-center justify-end gap-2">
                    <span className="text-sm font-medium text-slate-900">{formatCurrency(total)}</span>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {errors.lines?.root && (
            <p className="text-sm text-red-600">{errors.lines.root.message}</p>
          )}

          {/* Totals */}
          <div className="border-t border-slate-200 pt-4 space-y-1.5 ml-auto max-w-xs">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span><span>-{formatCurrency(totals.discount)}</span>
              </div>
            )}
            {totals.tax > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax</span><span>{formatCurrency(totals.tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-2">
              <span>Total</span><span>{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Notes & Terms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes to customer</label>
              <textarea {...register('notes')} rows={3} placeholder="Thank you for your business…" className={cn(inputCls(), 'resize-none')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Payment terms</label>
              <textarea {...register('terms')} rows={3} placeholder="Payment due within 30 days…" className={cn(inputCls(), 'resize-none')} />
            </div>
          </div>
        </div>

        {/* Actions */}
        {createMutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to save document'}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreview(true)} className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 bg-brand-primary text-white rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-60">
              {createMutation.isPending ? 'Saving…' : 'Save Document'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
