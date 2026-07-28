'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Shield, Search, Filter, LogIn, LogOut, Plus, Edit3,
  Trash2, FileText, Printer, Download,
} from 'lucide-react';

type AuditEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceNumber: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
};

const ACTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  login:    { label: 'Login',    icon: LogIn,     color: 'text-emerald-600 bg-emerald-50' },
  logout:   { label: 'Logout',   icon: LogOut,    color: 'text-slate-500 bg-slate-50' },
  create:   { label: 'Created',  icon: Plus,      color: 'text-blue-600 bg-blue-50' },
  update:   { label: 'Updated',  icon: Edit3,     color: 'text-amber-600 bg-amber-50' },
  delete:   { label: 'Deleted',  icon: Trash2,    color: 'text-red-600 bg-red-50' },
  void:     { label: 'Voided',   icon: FileText,  color: 'text-purple-600 bg-purple-50' },
  print:    { label: 'Printed',  icon: Printer,   color: 'text-slate-500 bg-slate-50' },
  export:   { label: 'Exported', icon: Download,  color: 'text-indigo-600 bg-indigo-50' },
};

const RESOURCE_LABELS: Record<string, string> = {
  sale:            'Sale',
  purchase_order:  'Purchase Order',
  expense:         'Expense',
  product:         'Product',
  customer:        'Customer',
  supplier:        'Supplier',
  journal_entry:   'Journal Entry',
  quote:           'Quote / Invoice',
  employee:        'Employee',
  payroll_run:     'Payroll Run',
  user:            'User',
  organization:    'Organisation',
};

export default function AuditLogPage() {
  const [search,       setSearch]       = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    limit: '50',
    ...(filterAction   ? { action: filterAction }         : {}),
    ...(filterResource ? { resourceType: filterResource } : {}),
    ...(search         ? { search }                       : {}),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filterAction, filterResource, search],
    queryFn: () => api.get<{ data: AuditEntry[]; page: number; limit: number }>(`/v1/audit-logs?${params}`),
    staleTime: 30_000,
  });

  const logs = data?.data ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-brand-primary/10 rounded-lg">
          <Shield className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-xs text-slate-500">Full activity trail for your organisation</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search reference…"
            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 w-52"
          />
        </div>

        <div className="relative flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <select
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); setPage(1); }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        >
          <option value="">All resources</option>
          {Object.entries(RESOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              {['Action', 'Resource', 'Reference', 'User', 'Date & Time'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="p-0"><TableSkeleton rows={8} cols={5} /></td></tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <Shield className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No audit events found</p>
                  <p className="text-xs text-slate-300 mt-1">Activity will appear here as users interact with the system</p>
                </td>
              </tr>
            ) : logs.map((log) => {
              const meta = ACTION_META[log.action] ?? { label: log.action, icon: FileText, color: 'text-slate-500 bg-slate-50' };
              const Icon = meta.icon;
              return (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full', meta.color)}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">
                    {RESOURCE_LABELS[log.resourceType] ?? log.resourceType.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {log.resourceNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {log.userName ? (
                      <div>
                        <p className="font-medium text-slate-800 text-xs">{log.userName}</p>
                        <p className="text-slate-400 text-xs">{log.userEmail}</p>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(log.createdAt)} &nbsp;
                    {new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {logs.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-slate-500">Page {page}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={logs.length < 50}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
