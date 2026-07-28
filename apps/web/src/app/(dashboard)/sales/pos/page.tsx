'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, Plus, Minus, Trash2, ChevronRight, X,
  Printer, Tag, User,
} from 'lucide-react';
import { api, productsApi, salesApi } from '@/lib/api';
import { usePOSStore, type CartLine, type CartPayment } from '@/stores/pos.store';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PrintableReceipt, usePrint, type ReceiptData, type ReceiptOrg, type ReceiptSettings } from '@/components/print/PrintableReceipt';

const PAYMENT_METHODS = [
  { value: 'cash',         label: 'Cash' },
  { value: 'bank',         label: 'Bank Transfer' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'afrimoney',    label: 'Afrimoney' },
  { value: 'qmoney',       label: 'QMoney' },
] as const;

export default function POSPage() {
  const [search, setSearch]           = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale]       = useState<Record<string, unknown> | null>(null);
  const savedCartRef = useRef<{ lines: CartLine[]; payments: CartPayment[] }>({ lines: [], payments: [] });
  const { user } = useAuthStore();

  const {
    lines, payments, clearCart, addLine, updateQty, removeLine, updateDiscount,
    setPayment, grandTotal, amountPaid, changeDue, subtotal, taxTotal, discountTotal,
  } = usePOSStore();

  const { data: productsData } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.list(search ? { q: search } : undefined),
  });

  const { data: orgData } = useQuery({
    queryKey: ['org'],
    queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org'),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => api.get<{ data: Record<string, unknown> }>('/v1/org/settings'),
  });

  const products = (productsData as { data: unknown[] } | undefined)?.data ?? [];

  const checkoutMutation = useMutation({
    mutationFn: () => {
      const body = {
        branchId: user?.branchId ?? null,
        customerId: usePOSStore.getState().customerId,
        date: new Date().toISOString().slice(0, 10),
        lines: lines.map((l) => ({
          productId: l.id,
          variantId: l.variantId ?? null,
          batchId: l.batchId ?? null,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountPct: String(l.discountPct),
          taxRate: String(l.taxRate),
          unitCost: String(l.unitCost),
        })),
        payments: payments.filter((p) => p.amount > 0).map((p) => ({
          method: p.method,
          amount: String(p.amount),
          accountId: p.accountId,
          reference: p.reference,
        })),
        notes: null,
      };
      return salesApi.create(body) as Promise<{ data: Record<string, unknown> }>;
    },
    onSuccess: (res) => {
      savedCartRef.current = {
        lines: [...lines],
        payments: [...payments.filter((p) => p.amount > 0)],
      };
      setLastSale(res.data);
      setShowReceipt(true);
      clearCart();
    },
  });

  const canCheckout = lines.length > 0 && amountPaid() >= grandTotal() && !checkoutMutation.isPending;

  const org = orgData?.data as Record<string, unknown> | undefined;
  const settings = settingsData?.data as Record<string, unknown> | undefined;

  return (
    <div className="flex h-[calc(100vh-48px)] gap-0 -m-6">
      {/* Left: Product Search */}
      <div className="flex flex-col flex-1 bg-slate-50 border-r border-border overflow-hidden">
        <div className="p-4 bg-white border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, or barcode…"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((p: unknown) => {
              const prod = p as Record<string, unknown>;
              const stock = (prod['stockLevel'] as number) ?? 0;
              return (
                <button
                  key={prod['id'] as string}
                  onClick={() =>
                    addLine({
                      id: prod['id'] as string,
                      name: prod['name'] as string,
                      sku: prod['sku'] as string | null,
                      quantity: 1,
                      unitPrice: Number(prod['sellingPrice']),
                      discountPct: 0,
                      taxRate: Number(prod['taxRate'] ?? 0),
                      unitCost: Number(prod['costPrice'] ?? 0),
                    })
                  }
                  disabled={stock <= 0 && !(prod['trackInventory'] === false)}
                  className={cn(
                    'bg-white rounded-xl p-3.5 text-left border transition-all shadow-sm',
                    'hover:border-brand-primary hover:shadow-md active:scale-95',
                    stock <= 0 && prod['trackInventory'] !== false
                      ? 'opacity-50 cursor-not-allowed'
                      : 'border-slate-200 cursor-pointer',
                  )}
                >
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center mb-2">
                    <Tag className="w-5 h-5 text-brand-primary" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">
                    {prod['name'] as string}
                  </p>
                  {Boolean(prod['sku']) && (
                    <p className="text-xs text-slate-400 mt-0.5">{prod['sku'] as string}</p>
                  )}
                  <p className="text-sm font-bold text-brand-primary mt-1.5">
                    {formatCurrency(Number(prod['sellingPrice']))}
                  </p>
                  <p className={cn('text-xs mt-0.5', stock <= 5 ? 'text-amber-500' : 'text-slate-400')}>
                    {stock} in stock
                  </p>
                </button>
              );
            })}
            {products.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-12 text-slate-400">
                <Search className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No products found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-96 flex flex-col bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500">Walk-in customer</span>
          <button className="ml-auto text-xs text-brand-primary hover:underline">Change</button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 py-16">
              <ShoppingCartEmpty />
              <p className="text-sm mt-3">Add items to start a sale</p>
            </div>
          ) : (
            lines.map((line) => (
              <CartLineRow
                key={line.id}
                line={line}
                onQtyChange={(q) => updateQty(line.id, q)}
                onDiscount={(pct) => updateDiscount(line.id, pct)}
                onRemove={() => removeLine(line.id)}
              />
            ))
          )}
        </div>

        <div className="border-t border-border bg-slate-50 px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal())}</span>
          </div>
          {discountTotal() > 0 && (
            <div className="flex justify-between text-amber-600">
              <span>Discount</span>
              <span>- {formatCurrency(discountTotal())}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>Tax</span>
            <span>{formatCurrency(taxTotal())}</span>
          </div>
          <div className="flex justify-between font-bold text-slate-900 text-base pt-1 border-t border-border">
            <span>Total</span>
            <span>{formatCurrency(grandTotal())}</span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border space-y-2">
          {payments.map((payment, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={payment.method}
                onChange={(e) => setPayment(i, { ...payment, method: e.target.value as CartPayment['method'] })}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={payment.amount || ''}
                onChange={(e) => setPayment(i, { ...payment, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-28 text-sm text-right border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>
          ))}

          {changeDue() > 0 && (
            <div className="flex justify-between text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              <span>Change due</span>
              <span>{formatCurrency(changeDue())}</span>
            </div>
          )}

          {checkoutMutation.isError && (
            <p className="text-xs text-red-600 text-center">
              {(checkoutMutation.error as Error).message}
            </p>
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={() => checkoutMutation.mutate()}
            disabled={!canCheckout}
            className={cn(
              'w-full py-3.5 rounded-xl font-bold text-sm transition-all',
              canCheckout
                ? 'bg-brand-secondary text-white hover:brightness-110 active:scale-95 shadow-lg shadow-emerald-200'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
          >
            {checkoutMutation.isPending ? 'Processing…' : `Charge ${formatCurrency(grandTotal())}`}
          </button>
        </div>
      </div>

      {/* Receipt modal */}
      {showReceipt && lastSale && (
        <ReceiptModal
          sale={lastSale}
          cartLines={savedCartRef.current.lines}
          cartPayments={savedCartRef.current.payments}
          org={org}
          settings={settings}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}

function ReceiptModal({
  sale, cartLines, cartPayments, org, settings, onClose,
}: {
  sale: Record<string, unknown>;
  cartLines: CartLine[];
  cartPayments: CartPayment[];
  org?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  onClose: () => void;
}) {
  const print = usePrint();

  const receiptOrg: ReceiptOrg = {
    name: String(org?.['name'] ?? 'LEDGERA Business'),
    address: org?.['address'] as string | undefined,
    phone: org?.['phone'] as string | undefined,
    email: org?.['email'] as string | undefined,
    logoUrl: org?.['logoUrl'] as string | undefined,
    tin: org?.['tin'] as string | undefined,
  };

  const receiptSettings: ReceiptSettings = {
    receiptHeaderText: settings?.['receiptHeaderText'] as string | undefined,
    receiptFooterText: settings?.['receiptFooterText'] as string | undefined,
    showLogoOnReceipt: settings?.['showLogoOnReceipt'] as boolean | undefined,
    showTinOnReceipt: settings?.['showTinOnReceipt'] as boolean | undefined,
    taxName: settings?.['taxName'] as string | undefined,
  };

  const receiptData: ReceiptData = {
    saleNumber: String(sale['saleNumber']),
    date: String(sale['date'] ?? new Date().toISOString()),
    cashierName: undefined,
    branchName: undefined,
    customerName: undefined,
    lines: cartLines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discountPct,
      total: l.quantity * l.unitPrice * (1 - l.discountPct / 100),
    })),
    subtotal: Number(sale['subtotal'] ?? cartLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)),
    discountTotal: Number(sale['discountTotal'] ?? 0),
    taxAmount: Number(sale['taxAmount'] ?? 0),
    taxRate: undefined,
    totalAmount: Number(sale['totalAmount']),
    amountPaid: Number(sale['amountPaid']),
    amountDue: Number(sale['amountDue'] ?? 0),
    changeDue: Number(sale['changeDue'] ?? 0),
    payments: cartPayments.map((p) => ({ method: p.method, amount: p.amount })),
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] flex flex-col">
        {/* Modal header — hidden during print */}
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Sale Complete</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable receipt area */}
        <div className="flex-1 overflow-y-auto">
          <PrintableReceipt org={receiptOrg} settings={receiptSettings} receipt={receiptData} />
        </div>

        {/* Action buttons — hidden during print */}
        <div className="no-print grid grid-cols-2 gap-2 p-4 border-t border-slate-100">
          <button
            onClick={() => print()}
            className="flex items-center justify-center gap-2 border border-slate-200 rounded-lg py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 bg-brand-primary text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-light"
          >
            <ChevronRight className="w-4 h-4" />
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

function CartLineRow({
  line, onQtyChange, onDiscount, onRemove,
}: {
  line: CartLine;
  onQtyChange: (q: number) => void;
  onDiscount: (pct: number) => void;
  onRemove: () => void;
}) {
  const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPct / 100) * (1 + line.taxRate / 100);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{line.name}</p>
          <p className="text-xs text-slate-400">{formatCurrency(line.unitPrice)} each</p>
        </div>
        <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => onQtyChange(line.quantity - 1)}
            className="px-2 py-1 text-slate-500 hover:bg-slate-50"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-sm font-semibold w-6 text-center">{line.quantity}</span>
          <button
            onClick={() => onQtyChange(line.quantity + 1)}
            className="px-2 py-1 text-slate-500 hover:bg-slate-50"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span>Disc.</span>
          <input
            type="number"
            value={line.discountPct || ''}
            onChange={(e) => onDiscount(parseFloat(e.target.value) || 0)}
            placeholder="0"
            min={0}
            max={100}
            className="w-10 text-center border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none"
          />
          <span>%</span>
        </div>
        <span className="ml-auto text-sm font-bold text-slate-900">
          {formatCurrency(lineTotal)}
        </span>
      </div>
    </div>
  );
}

function ShoppingCartEmpty() {
  return (
    <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
