'use client';

import { formatCurrency, formatDate } from '@/lib/utils';

export interface ReceiptOrg {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  tin?: string;
}

export interface ReceiptSettings {
  receiptHeaderText?: string;
  receiptFooterText?: string;
  showLogoOnReceipt?: boolean;
  showTinOnReceipt?: boolean;
  taxName?: string;
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
}

export interface ReceiptData {
  saleNumber: string;
  date: string;
  cashierName?: string;
  branchName?: string;
  customerName?: string;
  lines: ReceiptLine[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  taxRate?: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  changeDue?: number;
  payments: ReceiptPayment[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  orange_money: 'Orange Money',
  afrimoney: 'Afrimoney',
  qmoney: 'QMoney',
};

interface Props {
  org: ReceiptOrg;
  settings: ReceiptSettings;
  receipt: ReceiptData;
}

export function PrintableReceipt({ org, settings, receipt }: Props) {
  return (
    <div
      id="receipt-print-area"
      className="print-target bg-white font-mono text-xs"
      style={{ width: '80mm', margin: '0 auto', padding: '4mm' }}
    >
      {/* Header */}
      <div className="text-center mb-3">
        {settings.showLogoOnReceipt && org.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={org.name} className="h-12 mx-auto mb-2 object-contain" />
        )}
        {settings.receiptHeaderText && (
          <p className="text-[10px] text-gray-500 mb-1">{settings.receiptHeaderText}</p>
        )}
        <p className="font-bold text-sm">{org.name}</p>
        {org.address && <p className="text-[10px] text-gray-600">{org.address}</p>}
        {org.phone && <p className="text-[10px] text-gray-600">Tel: {org.phone}</p>}
        {org.email && <p className="text-[10px] text-gray-600">{org.email}</p>}
        {settings.showTinOnReceipt && org.tin && (
          <p className="text-[10px] text-gray-600">TIN: {org.tin}</p>
        )}
      </div>

      <Divider />

      {/* Receipt meta */}
      <div className="mb-2 space-y-0.5">
        <Row label="Receipt #" value={receipt.saleNumber} bold />
        <Row label="Date" value={formatDate(receipt.date)} />
        {receipt.cashierName && <Row label="Cashier" value={receipt.cashierName} />}
        {receipt.branchName && <Row label="Branch" value={receipt.branchName} />}
        {receipt.customerName && <Row label="Customer" value={receipt.customerName} />}
      </div>

      <Divider />

      {/* Line items */}
      <table className="w-full mb-2">
        <thead>
          <tr className="border-b border-dashed border-gray-400">
            <th className="text-left pb-1">Item</th>
            <th className="text-right pb-1">Qty</th>
            <th className="text-right pb-1">Price</th>
            <th className="text-right pb-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td className="pt-1 pr-1 max-w-[30mm] break-words">{line.name}</td>
              <td className="pt-1 text-right">{line.quantity}</td>
              <td className="pt-1 text-right">{formatCurrency(line.unitPrice)}</td>
              <td className="pt-1 text-right">{formatCurrency(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />

      {/* Totals */}
      <div className="mb-2 space-y-0.5">
        <Row label="Subtotal" value={formatCurrency(receipt.subtotal)} />
        {receipt.discountTotal > 0 && (
          <Row label="Discount" value={`-${formatCurrency(receipt.discountTotal)}`} />
        )}
        {receipt.taxAmount > 0 && (
          <Row
            label={`${settings.taxName ?? 'GST'}${receipt.taxRate ? ` (${receipt.taxRate}%)` : ''}`}
            value={formatCurrency(receipt.taxAmount)}
          />
        )}
        <Row label="TOTAL" value={formatCurrency(receipt.totalAmount)} bold large />
      </div>

      <Divider />

      {/* Payments */}
      <div className="mb-2 space-y-0.5">
        {receipt.payments.map((p, i) => (
          <Row key={i} label={METHOD_LABELS[p.method] ?? p.method} value={formatCurrency(p.amount)} />
        ))}
        {(receipt.changeDue ?? 0) > 0 && (
          <Row label="Change" value={formatCurrency(receipt.changeDue!)} />
        )}
        {receipt.amountDue > 0 && (
          <Row label="Balance Due" value={formatCurrency(receipt.amountDue)} bold />
        )}
      </div>

      <Divider />

      {/* Footer */}
      <div className="text-center mt-3 space-y-1">
        <p className="text-[10px] text-gray-600">
          {settings.receiptFooterText ?? 'Thank you for your business!'}
        </p>
        <p className="text-[9px] text-gray-400">Powered by LEDGERA</p>
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="border-dashed border-gray-400 my-1" />;
}

function Row({
  label, value, bold, large,
}: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''} ${large ? 'text-sm' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * Hook: triggers browser print on the receipt element only.
 * Call printReceipt() after rendering <PrintableReceipt />.
 */
export function usePrint() {
  // targetId is part of the public call signature (call sites pass e.g.
  // 'invoice-print-area') but isn't used yet — window.print() currently
  // relies on print CSS to hide everything except the printable area,
  // rather than scoping to a specific element id.
  const trigger = (_targetId?: string) => {
    window.print();
  };
  return trigger;
}
