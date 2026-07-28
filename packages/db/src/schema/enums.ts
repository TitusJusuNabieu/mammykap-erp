import { pgEnum } from 'drizzle-orm/pg-core';

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

export const entryStatusEnum = pgEnum('entry_status', ['draft', 'posted', 'voided']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank',
  'orange_money',
  'afrimoney',
  'qmoney',
  'cheque',
  'credit',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
]);

export const poStatusEnum = pgEnum('po_status', [
  'draft',
  'sent',
  'partial',
  'received',
  'cancelled',
]);

export const stockMethodEnum = pgEnum('stock_method', ['fifo', 'weighted_average']);

export const transferStatusEnum = pgEnum('transfer_status', [
  'pending',
  'in_transit',
  'received',
  'cancelled',
]);

export const payrollStatusEnum = pgEnum('payroll_status', [
  'draft',
  'processing',
  'completed',
  'cancelled',
]);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'growth',
  'business',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'paused',
]);

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'org_owner',
  'accountant',
  'branch_manager',
  'inventory_officer',
  'cashier',
  'employee',
  'viewer',
]);

export const expenseStatusEnum = pgEnum('expense_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'paid',
]);

export const currencyCodeEnum = pgEnum('currency_code', [
  'SLE',
  'USD',
  'GBP',
  'EUR',
  'NGN',
  'GHS',
  'XOF',
]);

export const quoteTypeEnum = pgEnum('quote_type', [
  'quotation',
  'proforma_invoice',
  'tax_invoice',
]);

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'void',
  'login',
  'logout',
  'export',
  'print',
  'approve',
  'reject',
  'access',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'sms',
  'whatsapp',
  'push',
]);

export const storeRequestStatusEnum = pgEnum('store_request_status', [
  'pending',
  'partially_supplied',
  'supplied',
  'rejected',
  'cancelled',
]);
