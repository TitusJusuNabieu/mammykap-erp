'use client';

import { formatDate } from '@/lib/utils';
import type { ReceiptOrg, ReceiptSettings } from './PrintableReceipt';

export interface CollectionNoteLine {
  name: string;
  sku?: string | null;
  quantityRequested: number;
  quantitySupplied: number;
  quantityRemaining: number;
}

export interface CollectionNoteData {
  storeRequestNumber: string;
  saleNumber: string;
  date: string;
  expectedCollectionDate?: string;
  customerName?: string;
  status?: string;
  lines: CollectionNoteLine[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting collection',
  partially_supplied: 'Partially collected',
  supplied: 'Fully collected',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

interface Props {
  org: ReceiptOrg;
  settings: ReceiptSettings;
  note: CollectionNoteData;
}

// Same 80mm thermal-slip shape as PrintableReceipt (same header conventions,
// same printer) — this is a separate document because it's handed over at a
// different moment (store desk, on collection) than the payment receipt.
export function PrintableCollectionNote({ org, settings, note }: Props) {
  const allSupplied = note.lines.every((l) => l.quantityRemaining <= 0.0005);

  return (
    <div
      id="collection-note-print-area"
      className="print-target bg-white font-mono text-xs"
      style={{ width: '80mm', margin: '0 auto', padding: '4mm' }}
    >
      {/* Header */}
      <div className="text-center mb-3">
        {settings.showLogoOnReceipt && org.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={org.name} className="h-12 mx-auto mb-2 object-contain" />
        )}
        <p className="font-bold text-sm">{org.name}</p>
        {org.address && <p className="text-[10px] text-gray-600">{org.address}</p>}
        {org.phone && <p className="text-[10px] text-gray-600">Tel: {org.phone}</p>}
        {settings.showTinOnReceipt && org.tin && (
          <p className="text-[10px] text-gray-600">TIN: {org.tin}</p>
        )}
      </div>

      <Divider />

      <p className="text-center font-bold text-sm mb-2 tracking-wide">
        {allSupplied ? 'COLLECTION NOTE' : 'TO BE COLLECTED'}
      </p>

      {/* Meta */}
      <div className="mb-2 space-y-0.5">
        <Row label="Note #" value={note.storeRequestNumber} bold />
        <Row label="Sale #" value={note.saleNumber} />
        <Row label="Date" value={formatDate(note.date)} />
        {note.expectedCollectionDate && (
          <Row label="Collect on" value={formatDate(note.expectedCollectionDate)} />
        )}
        {note.customerName && <Row label="Customer" value={note.customerName} />}
        {note.status && <Row label="Status" value={STATUS_LABELS[note.status] ?? note.status} bold />}
      </div>

      <Divider />

      {/* Line items */}
      <table className="w-full mb-2">
        <thead>
          <tr className="border-b border-dashed border-gray-400">
            <th className="text-left pb-1">Item</th>
            <th className="text-right pb-1">Req.</th>
            <th className="text-right pb-1">Left</th>
          </tr>
        </thead>
        <tbody>
          {note.lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td className="pt-1 pr-1 max-w-[34mm] break-words">{line.name}</td>
              <td className="pt-1 text-right">{line.quantityRequested}</td>
              <td className="pt-1 text-right font-bold">{line.quantityRemaining}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />

      {/* Footer */}
      <div className="text-center mt-3 space-y-1">
        <p className="text-[10px] text-gray-600">
          {allSupplied
            ? 'All items on this note have been collected.'
            : 'Present this note at the store/warehouse to collect your goods.'}
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
  label, value, bold,
}: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
