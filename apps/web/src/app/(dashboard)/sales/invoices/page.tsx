'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, salesApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import Link from 'next/link';
import { Printer, X } from 'lucide-react';
import { PrintableInvoice, type InvoiceData, type InvoiceOrg, type InvoiceSettings } from '@/components/print/PrintableInvoice';
import { usePrint } from '@/components/print/PrintableReceipt';

export default function InvoicesPage() {
  const [printSaleId, setPrintSaleId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: () => salesApi.list({ limit: '100' }),
  });

  const { data: orgData } = useQuery({
    queryKey: ['org'],
    queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org'),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org/settings'),
  });

  const { data: saleDetail, isLoading: isLoadingSale } = useQuery({
    queryKey: ['sale', printSaleId],
    queryFn: () => api.get<{ data: Record<string, unknown> }>(`/v1/sales/${printSaleId}`),
    enabled: !!printSaleId,
  });

  const sales = (data as { data: unknown[] } | undefined)?.data ?? [];
  const org = orgData?.data as Record<string, unknown> | undefined;
  const settings = settingsData?.data as Record<string, unknown> | undefined;
  const sale = saleDetail?.data as Record<string, unknown> | undefined;

  const STATUS_COLORS: Record<string, string> = {
    paid:      'badge-paid',
    partial:   'badge-partial',
    credit:    'badge-partial',
    cancelled: 'badge-draft',
    overdue:   'badge-overdue',
    draft:     'badge-draft',
  };

  const invoiceOrg: InvoiceOrg = {
    name: String(org?.['name'] ?? 'LEDGERA Business'),
    address: org?.['address'] as string | undefined,
    phone: org?.['phone'] as string | undefined,
    email: org?.['email'] as string | undefined,
    logoUrl: org?.['logoUrl'] as string | undefined,
    tin: org?.['tin'] as string | undefined,
    registrationNumber: org?.['registrationNumber'] as string | undefined,
  };

  const invoiceSettings: InvoiceSettings = {
    footerText:  settings?.['invoiceFooterText'] as string | undefined,
    terms:       settings?.['invoiceTerms'] as string | undefined,
    bankDetails: settings?.['invoiceBankDetails'] as string | undefined,
    showLogo:    settings?.['showLogoOnInvoice'] as boolean | undefined,
    showTin:     settings?.['showTinOnInvoice'] as boolean | undefined,
    taxName:     settings?.['taxName'] as string | undefined,
  };

  const buildInvoiceData = (s: Record<string, unknown>): InvoiceData => {
    const lines = (s['lines'] as unknown[] | undefined) ?? [];
    const payments = (s['payments'] as unknown[] | undefined) ?? [];

    return {
      invoiceNumber: String(s['saleNumber']),
      date: String(s['date']),
      dueDate: s['dueDate'] as string | undefined,
      status: s['status'] as InvoiceData['status'],
      branchName: s['branchName'] as string | undefined,
      customer: {
        name: String((s['customer'] as Record<string, unknown> | undefined)?.['name'] ?? 'Walk-in Customer'),
        address: (s['customer'] as Record<string, unknown> | undefined)?.['address'] as string | undefined,
        phone: (s['customer'] as Record<string, unknown> | undefined)?.['phone'] as string | undefined,
        email: (s['customer'] as Record<string, unknown> | undefined)?.['email'] as string | undefined,
        tin: (s['customer'] as Record<string, unknown> | undefined)?.['tin'] as string | undefined,
      },
      lines: lines.map((l: unknown) => {
        const line = l as Record<string, unknown>;
        return {
          description: String(line['productName'] ?? line['description'] ?? ''),
          quantity:    Number(line['quantity']),
          unitPrice:   Number(line['unitPrice']),
          discountPct: Number(line['discountPct'] ?? 0),
          taxRate:     Number(line['taxRate'] ?? 0),
          lineTotal:   Number(line['lineTotal'] ?? Number(line['quantity']) * Number(line['unitPrice'])),
        };
      }),
      subtotal:       Number(s['subtotal'] ?? s['totalAmount']),
      discountAmount: Number(s['discountTotal'] ?? s['discountAmount'] ?? 0),
      taxAmount: Number(s['taxAmount'] ?? 0),
      totalAmount: Number(s['totalAmount']),
      amountPaid: Number(s['amountPaid']),
      amountDue: Number(s['amountDue'] ?? 0),
      payments: payments.map((p: unknown) => {
        const pay = p as Record<string, unknown>;
        return { method: String(pay['method']), amount: Number(pay['amount']), date: pay['createdAt'] as string | undefined };
      }),
      notes: s['notes'] as string | undefined,
    };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Sales Invoices</h1>
        <Link href="/sales/pos"
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light">
          New Sale (POS)
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Invoice #', 'Date', 'Total', 'Paid', 'Balance', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">No sales yet</td></tr>
            ) : sales.map((s: unknown) => {
              const saleRow = s as Record<string, unknown>;
              return (
                <tr key={saleRow['id'] as string} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{saleRow['saleNumber'] as string}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(saleRow['date'] as string)}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(Number(saleRow['totalAmount']))}</td>
                  <td className="px-4 py-3 text-emerald-700">{formatCurrency(Number(saleRow['amountPaid']))}</td>
                  <td className={cn('px-4 py-3 font-semibold', Number(saleRow['amountDue']) > 0 ? 'text-red-600' : 'text-slate-400')}>
                    {formatCurrency(Number(saleRow['amountDue']))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded-full font-medium border', STATUS_COLORS[saleRow['status'] as string] ?? 'badge-draft')}>
                      {saleRow['status'] as string}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setPrintSaleId(saleRow['id'] as string)}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-primary border border-slate-200 hover:border-brand-primary/30 rounded-md px-2 py-1 transition-colors"
                    >
                      <Printer className="w-3 h-3" />
                      Print
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Print invoice modal */}
      {printSaleId && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4">
            <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">Invoice Preview</p>
              <div className="flex items-center gap-2">
                <PrintButton disabled={isLoadingSale || !sale} />
                <button onClick={() => setPrintSaleId(null)} className="text-slate-400 hover:text-slate-600 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[80vh]">
              {isLoadingSale || !sale ? (
                <div className="text-center py-16 text-slate-400">Loading invoice…</div>
              ) : (
                <PrintableInvoice
                  org={invoiceOrg}
                  settings={invoiceSettings}
                  data={buildInvoiceData(sale)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrintButton({ disabled }: { disabled: boolean }) {
  const print = usePrint();
  return (
    <button
      onClick={() => print('invoice-print-area')}
      disabled={disabled}
      className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light disabled:opacity-50"
    >
      <Printer className="w-4 h-4" />
      Print Invoice
    </button>
  );
}
