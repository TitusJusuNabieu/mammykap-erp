'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  Receipt, Building2, BarChart3, Settings,
  CreditCard, Smartphone, BookOpen, FileText, LogOut, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';

const NAV = [
  { label: 'Dashboard',   href: '/dashboard',         icon: LayoutDashboard },
  { label: 'Sales / POS', href: '/sales/pos',         icon: ShoppingCart },
  { label: 'Quotes & Invoices', href: '/sales/quotes', icon: ClipboardList },
  { label: 'Purchases',   href: '/purchases',         icon: Truck },
  { label: 'Inventory',   href: '/inventory',         icon: Package },
  { label: 'Customers',   href: '/customers',         icon: Users },
  { label: 'Expenses',    href: '/expenses',          icon: Receipt },
  { label: 'Payroll',     href: '/payroll',           icon: CreditCard },
  { label: 'Mobile Money',href: '/mobile-money',      icon: Smartphone },
  { label: 'Banking',     href: '/banking',           icon: Building2 },
  null, // divider
  { label: 'Reports',      href: '/reports',               icon: BarChart3 },
  { label: 'Journal',      href: '/accounting/journal',    icon: BookOpen },
  { label: 'Audit Log',    href: '/audit-log',             icon: FileText },
  null,
  { label: 'Settings',    href: '/settings',          icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    clearAuth();
    router.push('/login');
  };

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-brand-navy flex flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 bg-brand-secondary rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">L</span>
        </div>
        <span className="text-white font-bold text-lg tracking-tight">LEDGERA</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map((item, i) => {
          if (!item) {
            return <div key={i} className="my-3 border-t border-slate-800" />;
          }
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={cn(
                'sidebar-item',
                active && 'active',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">
              {user?.fullName?.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.fullName}</p>
            <p className="text-slate-500 text-xs capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-500 hover:text-red-400 text-xs w-full transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
