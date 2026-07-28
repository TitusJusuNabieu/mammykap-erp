'use client';

import { formatCurrency, formatDate } from '@/lib/utils';

export interface InvoiceOrg {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  tin?: string;
  registrationNumber?: string;
}

export interface InvoiceSettings {
  showLogo?: boolean;
  showTin?: boolean;
  footerText?: string;
  terms?: string;
  bankDetails?: string;
  taxName?: string;
}

export interface InvoiceCustomer {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  tin?: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxRate?: number;
  lineTotal: number;
}

export interface InvoiceData {
  id?: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  status: 'draft' | 'paid' | 'partial' | 'credit' | 'voided' | 'sent' | 'overdue';
  branchName?: string;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  payments?: Array<{ method: string; amount: number; date?: string }>;
  notes?: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft:   'DRAFT',
  paid:    'PAID',
  partial: 'PARTIAL',
  credit:  'UNPAID',
  voided:  'VOIDED',
  sent:    'SENT',
  overdue: 'OVERDUE',
};

const STATUS_COLORS: Record<string, string> = {
  draft:   '#94A3B8',
  paid:    '#10B981',
  partial: '#F59E0B',
  credit:  '#EF4444',
  voided:  '#94A3B8',
  sent:    '#3B82F6',
  overdue: '#EF4444',
};

const METHOD_LABELS: Record<string, string> = {
  cash:         'Cash',
  bank:         'Bank Transfer',
  orange_money: 'Orange Money',
  afrimoney:    'Afrimoney',
  qmoney:       'QMoney',
};

interface Props {
  org: InvoiceOrg;
  settings: InvoiceSettings;
  data: InvoiceData;
  docTitle?: string;
}

export function PrintableInvoice({ org, settings, data, docTitle = 'INVOICE' }: Props) {
  const statusColor = STATUS_COLORS[data.status] ?? '#94A3B8';
  const statusLabel = STATUS_LABELS[data.status] ?? data.status.toUpperCase();

  return (
    <div
      id="invoice-print-area"
      className="print-target bg-white text-xs"
      style={{ maxWidth: '210mm', margin: '0 auto', padding: '16mm', fontFamily: 'Inter, Arial, sans-serif', color: '#1E293B' }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        {/* Org branding */}
        <div>
          {settings.showLogo && org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt={org.name} style={{ height: '48px', objectFit: 'contain', marginBottom: '8px' }} />
          )}
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#1E3A8A' }}>{org.name}</div>
          {org.address && <div style={{ color: '#64748B', marginTop: '2px' }}>{org.address}</div>}
          {org.phone && <div style={{ color: '#64748B' }}>Tel: {org.phone}</div>}
          {org.email && <div style={{ color: '#64748B' }}>{org.email}</div>}
          {org.website && <div style={{ color: '#64748B' }}>{org.website}</div>}
          {settings.showTin && org.tin && <div style={{ color: '#64748B' }}>TIN: {org.tin}</div>}
          {org.registrationNumber && <div style={{ color: '#64748B' }}>Reg: {org.registrationNumber}</div>}
        </div>

        {/* Doc title + number + status */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1E3A8A', letterSpacing: '-0.5px' }}>{docTitle}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '4px', color: '#475569' }}>
            {data.invoiceNumber}
          </div>
          <div
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '4px 12px',
              borderRadius: '4px',
              border: `2px solid ${statusColor}`,
              color: statusColor,
              fontWeight: '700',
              fontSize: '11px',
              letterSpacing: '1px',
            }}
          >
            {statusLabel}
          </div>
        </div>
      </div>

      {/* Bill to + metadata */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>Bill To</div>
          <div style={{ fontWeight: '600', color: '#1E293B' }}>{data.customer.name}</div>
          {data.customer.address && <div style={{ color: '#64748B' }}>{data.customer.address}</div>}
          {data.customer.phone && <div style={{ color: '#64748B' }}>Tel: {data.customer.phone}</div>}
          {data.customer.email && <div style={{ color: '#64748B' }}>{data.customer.email}</div>}
          {data.customer.tin && <div style={{ color: '#64748B' }}>TIN: {data.customer.tin}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <MetaRow label="Date" value={formatDate(data.date)} />
          {data.dueDate && <MetaRow label="Due Date" value={formatDate(data.dueDate)} />}
          {data.branchName && <MetaRow label="Branch" value={data.branchName} />}
        </div>
      </div>

      {/* Line items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11px' }}>
        <thead>
          <tr style={{ backgroundColor: '#1E3A8A', color: 'white' }}>
            {['#', 'Description', 'Qty', 'Unit Price', 'Disc.', 'Total'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '8px 10px',
                  textAlign: h === '#' || h === 'Qty' || h === 'Disc.' || h === 'Total' || h === 'Unit Price' ? 'right' : 'left',
                  fontWeight: '600',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: i % 2 === 0 ? '#F8FAFC' : 'white' }}>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#94A3B8' }}>{i + 1}</td>
              <td style={{ padding: '8px 10px' }}>{line.description}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{line.quantity}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#94A3B8' }}>
                {line.discountPct ? `${line.discountPct}%` : '—'}
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div style={{ minWidth: '200px' }}>
          <TotalRow label="Subtotal" value={formatCurrency(data.subtotal)} />
          {data.discountAmount > 0 && (
            <TotalRow label="Discount" value={`-${formatCurrency(data.discountAmount)}`} />
          )}
          {data.taxAmount > 0 && (
            <TotalRow label={settings.taxName ?? 'GST'} value={formatCurrency(data.taxAmount)} />
          )}
          <div style={{ borderTop: '2px solid #1E3A8A', marginTop: '6px', paddingTop: '6px' }}>
            <TotalRow label="TOTAL DUE" value={formatCurrency(data.totalAmount)} bold />
          </div>
          {data.amountPaid > 0 && (
            <>
              <TotalRow label="Amount Paid" value={formatCurrency(data.amountPaid)} color="#10B981" />
              <TotalRow label="Balance Due" value={formatCurrency(data.amountDue)} bold color={data.amountDue > 0 ? '#EF4444' : '#10B981'} />
            </>
          )}
        </div>
      </div>

      {/* Payment history */}
      {data.payments && data.payments.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
            Payment History
          </div>
          {data.payments.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color: '#64748B' }}>{METHOD_LABELS[p.method] ?? p.method}{p.date ? ` — ${formatDate(p.date)}` : ''}</span>
              <span style={{ fontWeight: '600', color: '#10B981' }}>{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '4px' }}>Notes</div>
          <div style={{ color: '#475569', fontSize: '11px' }}>{data.notes}</div>
        </div>
      )}

      {/* Terms */}
      {settings.terms && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '4px' }}>Terms & Conditions</div>
          <div style={{ color: '#475569', fontSize: '11px', whiteSpace: 'pre-wrap' }}>{settings.terms}</div>
        </div>
      )}

      {/* Bank details */}
      {settings.bankDetails && (
        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#EFF6FF', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#1E3A8A', textTransform: 'uppercase', marginBottom: '4px' }}>Bank Transfer Details</div>
          <div style={{ color: '#1E40AF', fontSize: '11px', whiteSpace: 'pre-wrap' }}>{settings.bankDetails}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px', textAlign: 'center', color: '#94A3B8', fontSize: '10px' }}>
        <p>{settings.footerText ?? 'Payment is due within 30 days. Thank you for your business.'}</p>
        <p style={{ marginTop: '4px', color: '#CBD5E1' }}>Powered by LEDGERA · ledgera.app</p>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '4px', fontSize: '11px' }}>
      <span style={{ color: '#94A3B8', marginRight: '8px' }}>{label}:</span>
      <span style={{ fontWeight: '600' }}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px' }}>
      <span style={{ color: '#64748B' }}>{label}</span>
      <span style={{ fontWeight: bold ? '700' : '400', color: color ?? '#1E293B' }}>{value}</span>
    </div>
  );
}
