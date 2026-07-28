import { create } from 'zustand';

export interface CartLine {
  id: string;             // product id
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  unitCost: number;
  variantId?: string;
  batchId?: string;
}

export interface CartPayment {
  method: 'cash' | 'bank' | 'orange_money' | 'afrimoney' | 'qmoney';
  amount: number;
  accountId?: string;
  reference?: string;
}

interface POSState {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  payments: CartPayment[];
  branchId: string | null;

  addLine: (line: CartLine) => void;
  updateQty: (productId: string, qty: number) => void;
  updateDiscount: (productId: string, pct: number) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setPayment: (index: number, payment: CartPayment) => void;
  addPayment: (payment: CartPayment) => void;
  removePayment: (index: number) => void;
  setBranch: (id: string) => void;

  // Computed
  subtotal: () => number;
  taxTotal: () => number;
  discountTotal: () => number;
  grandTotal: () => number;
  amountPaid: () => number;
  changeDue: () => number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  lines: [],
  customerId: null,
  customerName: null,
  payments: [{ method: 'cash', amount: 0 }],
  branchId: null,

  addLine: (line) => {
    set((s) => {
      const existing = s.lines.find((l) => l.id === line.id && l.variantId === line.variantId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.id === line.id && l.variantId === line.variantId
              ? { ...l, quantity: l.quantity + line.quantity }
              : l,
          ),
        };
      }
      return { lines: [...s.lines, line] };
    });
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) {
      set((s) => ({ lines: s.lines.filter((l) => l.id !== productId) }));
    } else {
      set((s) => ({ lines: s.lines.map((l) => (l.id === productId ? { ...l, quantity: qty } : l)) }));
    }
  },

  updateDiscount: (productId, pct) => {
    set((s) => ({
      lines: s.lines.map((l) => (l.id === productId ? { ...l, discountPct: pct } : l)),
    }));
  },

  removeLine: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.id !== productId) })),

  clearCart: () => set({ lines: [], customerId: null, customerName: null, payments: [{ method: 'cash', amount: 0 }] }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setPayment: (index, payment) =>
    set((s) => {
      const payments = [...s.payments];
      payments[index] = payment;
      return { payments };
    }),

  addPayment: (payment) => set((s) => ({ payments: [...s.payments, payment] })),

  removePayment: (index) =>
    set((s) => ({ payments: s.payments.filter((_, i) => i !== index) })),

  setBranch: (id) => set({ branchId: id }),

  subtotal: () => {
    const { lines } = get();
    return lines.reduce((s, l) => {
      const gross = l.quantity * l.unitPrice;
      return s + gross * (1 - l.discountPct / 100);
    }, 0);
  },

  taxTotal: () => {
    const { lines } = get();
    return lines.reduce((s, l) => {
      const gross = l.quantity * l.unitPrice;
      const afterDiscount = gross * (1 - l.discountPct / 100);
      return s + afterDiscount * (l.taxRate / 100);
    }, 0);
  },

  discountTotal: () => {
    const { lines } = get();
    return lines.reduce((s, l) => {
      const gross = l.quantity * l.unitPrice;
      return s + gross * (l.discountPct / 100);
    }, 0);
  },

  grandTotal: () => get().subtotal() + get().taxTotal(),

  amountPaid: () => get().payments.reduce((s, p) => s + p.amount, 0),

  changeDue: () => Math.max(0, get().amountPaid() - get().grandTotal()),
}));
