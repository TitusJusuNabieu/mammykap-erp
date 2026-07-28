'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, AlertTriangle } from 'lucide-react';
import { productsApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, lowStock],
    queryFn: () => productsApi.list({ q: search, ...(lowStock && { low_stock: 'true' }) }),
  });

  const products = (data as { data: unknown[] } | undefined)?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
        <Link
          href="/inventory/new"
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
        </div>
        <button
          onClick={() => setLowStock((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors',
            lowStock
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
          )}
        >
          <AlertTriangle className="w-4 h-4" />
          Low Stock
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {['Product', 'SKU', 'Category', 'Selling Price', 'Stock', 'Value', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">Loading…</td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">No products found</td>
              </tr>
            ) : (
              products.map((p: unknown) => {
                const prod = p as Record<string, unknown>;
                const stock = Number(prod['stockLevel'] ?? 0);
                const reorder = Number(prod['reorderPoint'] ?? 10);
                const isService = prod['trackInventory'] === false;
                return (
                  <tr key={prod['id'] as string} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{prod['name'] as string}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {(prod['sku'] as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {(prod['categoryName'] as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {formatCurrency(Number(prod['sellingPrice']))}
                    </td>
                    <td className="px-4 py-3">
                      {isService ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                          Service
                        </span>
                      ) : (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                          stock === 0
                            ? 'bg-red-50 text-red-700'
                            : stock <= reorder
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700',
                        )}>
                          {stock <= reorder && stock > 0 && <AlertTriangle className="w-3 h-3" />}
                          {stock}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {isService ? '—' : formatCurrency(stock * Number(prod['costPrice'] ?? 0))}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/${prod['id'] as string}`}
                        className="text-xs text-brand-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
