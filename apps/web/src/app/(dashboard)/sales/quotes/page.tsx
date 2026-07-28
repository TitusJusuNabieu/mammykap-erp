'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Printer, Trash2, Send, CheckCircle, XCircle, Clock, FileText, X } from 'lucide-react';
import { api, quotesApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { PrintableInvoice, type InvoiceData, type InvoiceOrg, type InvoiceSettings } from '@/components/print/PrintableInvoice';
import { usePrint } from '@/components/print/PrintableReceipt';

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
type QuoteType   = 'quotation' | 'proforma_invoice' | 'tax_invoice';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  type: QuoteType;
  status: QuoteStatus;
  customerName: string | null;
  date: string;
  expiryDate: string | null;
  dueDate: string | null;
  totalAmount: string;
}

interface QuoteLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

interface QuoteDetail extends QuoteRow {
  lines: QuoteLine[];
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
}

const STATUS_META: Record<QuoteStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600 border-slate-200',   icon: FileText },
  sent:      { label: 'Sent',      color: 'bg-blue-50 text-blue-700 border-blue-200',       icon: Send },
  accepted:  { label: 'Accepted',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected:  { label: 'Rejected',  color: 'bg-red-50 text-red-700 border-red-200',          icon: XCircle },
  expired:   { label: 'Expired',   color: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  converted: { label: 'Converted', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: CheckCircle },
};

const TYPE_LABEL: Record<QuoteType, string> = {
  quotation:        'Quotation',
  proforma_invoice: 'Proforma Invoice',
  tax_invoice:      'Tax Invoice',
};

function PrintButton({ quoteId: _quoteId }: { quoteId: string }) {
  const print = usePrint();
  return (
    <button onClick={() => print('invoice-print-area')} className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-primary text-white rounded-lg hover:bg-brand-light transition-colors">
      <Printer className="w-3.5 h-3.5" /> Print / PDF
    </button>
  );
}

export default function QuotesPage() {
  const qc = useQueryClient();
  const [printQuoteId, setPrintQuoteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => quotesApi.list({ limit: '100' }),
  });

  const { data: orgData }      = useQuery({ queryKey: ['org'],          queryFn: () => api.get<{ data: unknown }>('/v1/org') });
  const { data: settingsData } = useQuery({ queryKey: ['org-settings'], queryFn: () => api.get<{ data: unknown }>('/v1/org/settings') });

  const { data: quoteDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['quote', printQuoteId],
    queryFn: () => quotesApi.get(printQuoteId!),
    enabled: !!printQuoteId,
  });

  const markSent = useMutation({
    mutationFn: (id: string) => quotesApi.update(id, { status: 'sent' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });

  const deleteQuote = useMutation({
    mutationFn: (id: string) => quotesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });

  const quotes = (data as { data: QuoteRow[] } | undefined)?.data ?? [];
  const org      = (orgData as { data: Record<string, unknown> } | undefined)?.data;
  const settings = (settingsData as { data: Record<string, unknown> } | undefined)?.data;
  const detail   = (quoteDetail as { data: QuoteDetail } | undefined)?.data;

  const invoiceOrg: InvoiceOrg = {
    name:               String(org?.['name'] ?? 'LEDGERA Business'),
    address:            org?.['address'] as string | undefined,
    phone:              org?.['phone'] as string | undefined,
    email:              org?.['email'] as string | undefined,
    logoUrl:            org?.['logoUrl'] as string | undefined,
    tin:                org?.['tin'] as string | undefined,
    registrationNumber: org?.['registrationNumber'] as string | undefined,
  };

  const invoiceSettings: InvoiceSettings = {
    showLogo:            Boolean(settings?.['showLogoOnInvoice'] ?? true),
    showTin:             Boolean(settings?.['showTinOnInvoice'] ?? true),
    footerText:          settings?.['invoiceFooterText'] as string | undefined,
    terms:               settings?.['invoiceTerms'] as string | undefined,
    bankDetails:         settings?.['invoiceBankDetails'] as string | undefined,
  };

  function buildInvoiceData(): InvoiceData | null {
    if (!detail) return null;
    return {
      id:             detail.id,
      invoiceNumber:  detail.quoteNumber,
      date:           detail.date,
      dueDate:        detail.dueDate ?? undefined,
      status:         'draft',
      customer: {
        name:    detail.customerName ?? 'Customer',
        email:   detail.customerEmail ?? undefined,
        phone:   detail.customerPhone ?? undefined,
        address: detail.customerAddress ?? undefined,
      },
      lines: detail.lines.map((l) => ({
        description: l.description,
        quantity:    Number(l.quantity),
        unitPrice:   Number(l.unitPrice),
        discountPct: Number(l.discountPct),
        taxRate:     Number(l.taxRate),
        lineTotal:   Number(l.lineTotal),
      })),
      subtotal:       Number(detail.subtotal),
      discountAmount: Number(detail.discountAmount),
      taxAmount:      Number(detail.taxAmount),
      totalAmount:    Number(detail.totalAmount),
      amountPaid:     0,
      amountDue:      Number(detail.totalAmount),
      notes:          detail.notes ?? undefined,
      payments:       [],
    };
  }

  const invoiceData = buildInvoiceData();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes & Invoices</h1>
          <p className="text-slate-500 text-sm mt-0.5">Create quotations, proforma invoices and tax invoices</p>
        </div>
        <Link
          href="/sales/quotes/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors"
        >
          <Plus className="w-4 h-4" /> New Document
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No quotes yet</p>
            <p className="text-slate-400 text-sm mt-1">Create your first quotation or invoice to send to customers.</p>
            <Link href="/sales/quotes/new" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors">
              <Plus className="w-4 h-4" /> Create document
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Number</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Expiry</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotes.map((q) => {
                const meta = STATUS_META[q.status];
                const Icon = meta.icon;
                return (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 font-medium">{q.quoteNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABEL[q.type]}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{q.customerName ?? <span className="text-slate-400 italic">No customer</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(q.date)}</td>
                    <td className="px-4 py-3 text-slate-500">{q.expiryDate ? formatDate(q.expiryDate) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(Number(q.totalAmount))}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', meta.color)}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setPrintQuoteId(q.id)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                          title="Print / PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {q.status === 'draft' && (
                          <button
                            onClick={() => markSent.mutate(q.id)}
                            className="p-1.5 rounded hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors"
                            title="Mark as Sent"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {q.status === 'draft' && (
                          <button
                            onClick={() => { if (confirm('Delete this document?')) deleteQuote.mutate(q.id); }}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Print Modal */}
      {printQuoteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="font-semibold text-slate-900">Print / Export PDF</h2>
              <div className="flex items-center gap-2">
                {loadingDetail ? null : <PrintButton quoteId={printQuoteId} />}
                <button onClick={() => setPrintQuoteId(null)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetail ? (
                <div className="text-center py-12 text-slate-400">Loading document…</div>
              ) : invoiceData ? (
                <PrintableInvoice
                  data={invoiceData}
                  org={invoiceOrg}
                  settings={invoiceSettings}
                  docTitle={detail?.type === 'quotation' ? 'QUOTATION' : detail?.type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'TAX INVOICE'}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
