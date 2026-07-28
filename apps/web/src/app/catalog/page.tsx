'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, ShoppingBag, Plus, Minus, Trash2, X, CheckCircle2,
  ArrowLeft, MapPin,
} from 'lucide-react';
import { publicApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';

interface CatalogItem {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  sellingPrice: string;
  imageUrl: string | null;
  status: 'available' | 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

const STATUS_META: Record<CatalogItem['status'], { label: string; color: string }> = {
  available:    { label: 'Available',    color: 'bg-blue-50 text-blue-700' },
  in_stock:     { label: 'In Stock',     color: 'bg-emerald-50 text-emerald-700' },
  low_stock:    { label: 'Low Stock',    color: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Out of Stock', color: 'bg-slate-100 text-slate-500' },
};

export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [confirmation, setConfirmation] = useState<{ referenceNumber: string; totalAmount: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['public-catalog', search],
    queryFn: () => publicApi.getCatalog(search || undefined),
  });
  const { data: orgData } = useQuery({ queryKey: ['public-org'], queryFn: () => publicApi.getOrg() });

  const items = (data?.data ?? []) as CatalogItem[];
  const org = orgData?.data;

  function addToCart(item: CatalogItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      if (existing) {
        return prev.map((l) => (l.productId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: item.id, name: item.name, unitPrice: Number(item.sellingPrice), quantity: 1 }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
    } else {
      setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
    }
  }

  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" /> {org?.name ?? 'Home'}
          </Link>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light transition-colors flex-shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Request</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-secondary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Catalog grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Our Catalog</h1>
        <p className="text-sm text-slate-500 mb-6">Add items to a request, then submit — pay and collect in person at the shop.</p>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => {
              const meta = STATUS_META[item.status];
              const inCart = cart.find((l) => l.productId === item.id);
              return (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', meta.color)}>{meta.label}</span>
                    {item.category && <span className="text-[10px] text-slate-400 truncate">{item.category}</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-snug flex-1">{item.name}</p>
                  {item.sku && <p className="text-xs text-slate-400 mt-0.5">{item.sku}</p>}
                  <p className="text-base font-bold text-brand-primary mt-2">{formatCurrency(item.sellingPrice)}</p>
                  <button
                    onClick={() => addToCart(item)}
                    disabled={item.status === 'out_of_stock'}
                    className={cn(
                      'mt-3 w-full py-2 rounded-lg text-xs font-semibold transition-colors',
                      item.status === 'out_of_stock'
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white',
                    )}
                  >
                    {inCart ? `Added (${inCart.quantity}) — add more` : 'Add to request'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 py-6 text-center">
        <a
          href="https://unlimitedinnovations.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-slate-600 text-xs transition-colors"
        >
          Powered by Unlimited Innovation
        </a>
      </footer>

      {/* Cart / request modal */}
      {showCart && (
        <CartModal
          cart={cart}
          cartTotal={cartTotal}
          orgAddress={org?.address}
          confirmation={confirmation}
          onUpdateQty={updateQty}
          onClose={() => { setShowCart(false); if (confirmation) { setCart([]); setConfirmation(null); } }}
          onSubmitted={setConfirmation}
        />
      )}
    </div>
  );
}

function CartModal({
  cart, cartTotal, orgAddress, confirmation, onUpdateQty, onClose, onSubmitted,
}: {
  cart: CartLine[];
  cartTotal: number;
  orgAddress: string | null | undefined;
  confirmation: { referenceNumber: string; totalAmount: string } | null;
  onUpdateQty: (productId: string, quantity: number) => void;
  onClose: () => void;
  onSubmitted: (c: { referenceNumber: string; totalAmount: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const submit = useMutation({
    mutationFn: () => publicApi.submitPurchaseRequest({
      customerName: name,
      customerPhone: phone,
      customerEmail: email || undefined,
      notes: notes || undefined,
      lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    }),
    onSuccess: (res) => onSubmitted(res.data),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-sm font-semibold text-slate-800">
            {confirmation ? 'Request Submitted' : 'Your Request'}
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {confirmation ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-2xl font-bold text-slate-900 font-mono">{confirmation.referenceNumber}</p>
              <p className="text-sm text-slate-500 mt-1">Your reference number — save this</p>
              <p className="text-lg font-semibold text-brand-primary mt-4">{formatCurrency(confirmation.totalAmount)}</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-5 text-left flex gap-2">
                <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Bring this reference number to <strong>{orgAddress ?? 'our shop'}</strong> to pay and collect your items. No payment is needed online.
                </p>
              </div>
            </div>
          ) : cart.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Your request is empty — add items from the catalog.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {cart.map((line) => (
                  <div key={line.productId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{line.name}</span>
                    <div className="flex items-center gap-1 border border-slate-200 rounded-lg overflow-hidden">
                      <button onClick={() => onUpdateQty(line.productId, line.quantity - 1)} className="px-1.5 py-1 text-slate-500 hover:bg-slate-50">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-medium">{line.quantity}</span>
                      <button onClick={() => onUpdateQty(line.productId, line.quantity + 1)} className="px-1.5 py-1 text-slate-500 hover:bg-slate-50">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="w-20 text-right font-semibold">{formatCurrency(line.unitPrice * line.quantity)}</span>
                    <button onClick={() => onUpdateQty(line.productId, 0)} className="text-slate-300 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-3">
                <span>Estimated Total</span>
                <span className="text-brand-primary">{formatCurrency(cartTotal)}</span>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Your name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Phone number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+232 XX XXX XXX"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Email (optional)</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 resize-none" />
                </div>
              </div>

              {submit.isError && (
                <p className="text-xs text-red-600 text-center">{(submit.error as Error).message}</p>
              )}
            </div>
          )}
        </div>

        {!confirmation && cart.length > 0 && (
          <div className="p-5 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={() => submit.mutate()}
              disabled={!name.trim() || !phone.trim() || submit.isPending}
              className="w-full py-3 rounded-xl font-bold text-sm bg-brand-secondary text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submit.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
