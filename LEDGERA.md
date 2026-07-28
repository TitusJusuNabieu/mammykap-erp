# LEDGERA — System Reference
### *Every transaction tells a story.*

**Version:** 1.0 | **Stack:** Next.js 15 + Fastify 5 + PostgreSQL + Drizzle ORM | **Market:** Sierra Leone / West Africa

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technical Stack](#2-technical-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema](#4-database-schema)
5. [Accounting Engine](#5-accounting-engine)
6. [Inventory Engine](#6-inventory-engine)
7. [Payroll Engine](#7-payroll-engine)
8. [Monime Payments](#8-monime-payments)
9. [Authentication & RBAC](#9-authentication--rbac)
10. [API Reference](#10-api-reference)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Subscription Plans](#12-subscription-plans)
13. [Running Locally](#13-running-locally)
14. [Environment Variables](#14-environment-variables)
15. [Permission Matrix](#15-permission-matrix)
16. [Roadmap](#16-roadmap)

---

## 1. Product Overview

LEDGERA is a **cloud-based multi-tenant SaaS** Business Management & Accounting Platform for African SMEs. It serves as a complete financial OS: every business event (sale, purchase, expense, payroll, mobile money movement) automatically creates double-entry journal entries — making every transaction traceable and auditable.

### Target market
- **Primary:** Sierra Leone — retail stores, pharmacies, wholesalers, restaurants, NGOs, schools
- **Expansion:** West & East Africa, diaspora businesses

### Core principles
1. **Accounting first** — no module bypasses the accounting engine; `DR = CR` is enforced at the data layer
2. **Africa first** — SLE currency, NASSIT/PAYE payroll, Orange Money/Afrimoney/QMoney, Monime billing
3. **Multi-tenant** — shared DB, row-level isolation by `organization_id`, JWT carries `orgId`
4. **Role-aware** — 8 RBAC roles from `super_admin` down to `viewer`
5. **Audit-grade** — immutable journal entries, soft-delete only, full audit log

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| **Monorepo** | Turborepo + pnpm workspaces |
| **API** | Fastify 5 (ESM, TypeScript, schema-validated) |
| **Frontend** | Next.js 15 App Router, React 19, Tailwind CSS |
| **Database** | PostgreSQL 15 (Drizzle ORM v0.44+) |
| **Cache / Queue** | Redis 7 (BullMQ) |
| **Auth** | JWT HS256 (dev) / RS256 (prod) + httpOnly refresh cookie |
| **Payments** | Monime.io (Sierra Leone mobile money — Orange Money, Afrimoney, QMoney) |
| **State (frontend)** | Zustand (auth + POS cart) |
| **Data fetching** | TanStack Query v5 |
| **Forms** | React Hook Form + Zod |
| **Email** | SMTP (Mailpit in dev) |
| **Storage** | Local filesystem (dev) / AWS S3 af-south-1 (prod) |
| **Infra** | Native PostgreSQL 15 + Redis 7 (no containers) — see DEV_SETUP.md |

---

## 3. Repository Structure

```
ledgera/
├── apps/
│   ├── api/                            # Fastify backend
│   │   └── src/
│   │       ├── server.ts               # App bootstrap + route registration
│   │       ├── middleware/auth.ts      # JWT authenticate + requireMinRole
│   │       ├── plugins/                # database.ts, redis.ts (fastify-plugin)
│   │       ├── services/
│   │       │   └── monime.service.ts   # Monime.io API wrapper
│   │       ├── utils/
│   │       │   ├── errors.ts           # AppError hierarchy
│   │       │   └── sequence.ts         # Atomic sequence generator
│   │       └── modules/
│   │           ├── auth/               # Login, register, refresh, 2FA
│   │           ├── organizations/      # Org CRUD, branches, users, invites, period close
│   │           ├── accounting/         # Chart of accounts, journal entries, fiscal periods
│   │           ├── inventory/          # Products, stock levels, movements, categories
│   │           ├── sales/              # POS sales, invoices, void
│   │           ├── purchases/          # POs, GRNs, supplier payments
│   │           ├── expenses/           # Expenses + approval workflow
│   │           ├── payroll/            # Departments, employees, payroll runs, payslips
│   │           ├── banking/            # Bank accounts, bank txs, MoMo wallets/txs
│   │           ├── reports/            # P&L, Balance Sheet, Trial Balance, GL, Inv Val.
│   │           └── billing/            # Monime subscription billing + POS payment init
│   └── web/                            # Next.js 15 frontend
│       └── src/
│           ├── app/
│           │   ├── (auth)/             # /login, /register
│           │   └── (dashboard)/        # All authenticated pages
│           ├── components/layout/      # Sidebar navigation
│           ├── stores/                 # auth.store.ts, pos.store.ts (Zustand)
│           ├── lib/api.ts              # Typed fetch client
│           ├── lib/utils.ts            # cn, formatCurrency, formatDate, today
│           └── middleware.ts           # Route guard (checks refresh_token cookie)
├── packages/
│   └── db/                             # @ledgera/db shared package
│       └── src/
│           ├── client.ts               # Drizzle client
│           ├── schema/                 # All table definitions
│           ├── migrate.ts              # Migration runner (tsx)
│           └── seed.ts                 # Dev seed data
├── scripts/postgres-init.sql            # Role setup (ledgera_app/ledgera_bypass) + extensions — run via psql, no containers
├── USER_MANUAL.md                      # End-user manual (export to PDF/Word with Pandoc)
└── LEDGERA.md                          # This file — complete system reference
```

---

## 4. Database Schema

### Key design decisions
- Every table carries `organization_id` — tenant isolation enforced at query layer
- All monetary values stored as `numeric(15,4)`, which Drizzle maps to `string` in TypeScript; insert as `String(value)`
- Soft-delete via `isActive` boolean — no `DELETE` on accounting tables
- UUIDs via `uuid_generate_v4()` (requires `uuid-ossp` extension, seeded in `init.sql`)
- Human-readable numbers (INV-000001) via `sequences` table with atomic `UPDATE … RETURNING`

### Core tables (summary)

| Table | Purpose |
|---|---|
| `organizations` | Tenant root — name, slug, currency, timezone |
| `branches` | Physical locations per org |
| `organization_users` | RBAC membership — user × org × role × branch |
| `org_invitations` | Invite tokens with 7-day expiry |
| `users` | Auth identities — email, passwordHash, totpSecret |
| `user_sessions` | Refresh token store — tokenHash, expiresAt |
| `subscriptions` | Billing state — plan, status, currentPeriodEnd |
| `organization_settings` | Per-org config — tax, receipt prefix, allowNegativeStock |
| `fiscal_years` | Accounting year boundaries |
| `fiscal_periods` | Monthly periods — isClosed, closedAt, closedBy |
| `accounts` | Chart of accounts — code, name, type, parentId |
| `journal_entries` | Double-entry header — entryNumber, date, status |
| `journal_lines` | DR/CR lines — accountId, debit, credit |
| `products` | Product master — sku, barcode, costPrice, sellingPrice |
| `stock_levels` | Per-branch quantity + avgCost |
| `stock_movements` | Immutable stock audit trail |
| `sales` | Sale header — saleNumber, customerId, totalAmount, status |
| `sale_lines` | Line items — quantity, unitPrice, discount, cogs |
| `sale_payments` | Payment splits — method, amount |
| `purchase_orders` | PO header — poNumber, supplierId, status |
| `goods_received_notes` | GRN — grnNumber, receivedDate |
| `expenses` | Expense header — amount, categoryId, status |
| `payroll_runs` | Payroll batch — month, year, status |
| `payslips` | Per-employee — grossPay, nassitEmp, paye, netPay |
| `bank_accounts` | Bank ledger — bankName, accountNumber, currentBalance |
| `bank_transactions` | Deposit / withdrawal / charge per bank account |
| `mobile_money_wallets` | MoMo ledger — provider, phoneNumber, currentBalance |
| `mobile_money_transactions` | Receive / send / fee per wallet |
| `sequences` | Atomic number series per org (INV, RCP, PO, EXP, JE) |
| `audit_logs` | Immutable trail — userId, action, changes |

### Default Chart of Accounts (26 seeded on org creation)

| Code | Name | Type |
|---|---|---|
| 1000 | Cash in Hand | Asset |
| 1010 | Petty Cash | Asset |
| 1100 | Orange Money Wallet | Asset |
| 1110 | Afrimoney Wallet | Asset |
| 1120 | QMoney Wallet | Asset |
| 1200 | Bank Account | Asset |
| 1300 | Accounts Receivable | Asset |
| 1400 | Inventory | Asset |
| 1500 | Other Current Assets | Asset |
| 1600 | Fixed Assets | Asset |
| 2000 | Accounts Payable | Liability |
| 2100 | Salary Payable | Liability |
| 2200 | NASSIT Payable | Liability |
| 2300 | PAYE Payable | Liability |
| 2400 | Tax Payable (GST) | Liability |
| 2500 | Other Current Liabilities | Liability |
| 3000 | Owner's Equity | Equity |
| 3100 | Retained Earnings | Equity |
| 4000 | Sales Revenue | Revenue |
| 4100 | Service Revenue | Revenue |
| 5000 | Cost of Goods Sold | Expense |
| 6000 | Salary Expense | Expense |
| 6100 | NASSIT Expense (Employer) | Expense |
| 6200 | Rent Expense | Expense |
| 6300 | Utilities Expense | Expense |
| 6400 | Mobile Money Fees | Expense |

---

## 5. Accounting Engine

**File:** `apps/api/src/modules/accounting/accounting.engine.ts`

The `AccountingEngine` class is the **only** code that writes to `journal_entries` and `journal_lines`. Every other module calls `engine.postJournal()`.

### Invariants
- `assertBalanced()` throws `AccountingError` if `|totalDebit − totalCredit| > 0.005`
- `getOpenPeriod()` throws `PeriodClosedError` if no open period exists for the entry date
- All account IDs validated to belong to the org before posting
- Entry number atomically incremented: `UPDATE sequences SET current_value = current_value + 1 WHERE … RETURNING current_value`

### Journal entry templates

| Transaction | Debit | Credit |
|---|---|---|
| Cash sale | Cash in Hand | Sales Revenue |
| Cash sale COGS | Cost of Goods Sold | Inventory |
| Credit sale | Accounts Receivable | Sales Revenue |
| Sale with tax | Cash / AR | Sales Revenue + Tax Payable (GST) |
| Mobile money sale | MoMo Wallet | Sales Revenue |
| Goods received (GRN) | Inventory | Accounts Payable |
| Supplier payment | Accounts Payable | Cash / Bank |
| Expense approved | Expense Account | Cash / Bank |
| Payroll posted | Salary Expense + NASSIT Employer Exp | Salary Payable + NASSIT Payable + PAYE Payable |
| Bank deposit | Bank Account | Cash in Hand |
| MoMo receive | MoMo Wallet | Revenue / AR |
| MoMo send | Expense / AP | MoMo Wallet |
| MoMo fee | Mobile Money Fees | MoMo Wallet |
| Bank charge | Bank Charges (expense) | Bank Account |
| Void (any) | All credits reversed | All debits reversed |

### `voidJournal()` design
Does **not** use an outer `db.transaction()`. Reads original entry directly → calls `postJournal()` (its own transaction) for the reversal → updates original entry status. Avoids nested transactions which cause savepoint complexity.

---

## 6. Inventory Engine

**File:** `apps/api/src/modules/inventory/inventory.engine.ts`

### `adjustStock()` flow
```
db.transaction:
  1. SELECT … FOR UPDATE on stock_levels row (prevents concurrent oversell)
  2. newQty = currentQty + input.quantity
  3. if newQty < 0:
       SELECT allowNegativeStock FROM organization_settings WHERE org_id = input.orgId
       if !allowNegativeStock → throw InsufficientStockError
  4. Recalculate weighted average cost (stock-in only):
       newAvgCost = (currentQty × currentAvgCost + addedQty × unitCost) / newQty
  5. UPDATE or INSERT stock_levels (upsert)
  6. INSERT stock_movements (immutable audit record)
```

### FIFO allocation (`allocateFIFO`)
Fetches `stock_batches` ordered by `createdAt ASC`. Greedily takes from oldest batch first. Returns `{ allocations[], totalCost }`. Throws `InsufficientStockError` if stock is insufficient.

### Weighted average COGS (`getCOGSWeightedAvg`)
Returns `quantity × avgCost` from current `stock_levels` row. Used when calculating COGS at time of sale.

---

## 7. Payroll Engine

**File:** `apps/api/src/modules/payroll/payroll.routes.ts`

### Sierra Leone NASSIT contributions

| Party | Rate | Basis |
|---|---|---|
| Employee | 5% | Gross salary |
| Employer | 10% | Gross salary |

### Sierra Leone PAYE (progressive income tax)

| Annual Income (SLE) | Monthly Equivalent | Rate |
|---|---|---|
| 0 – 720,000 | 0 – 60,000 | 0% |
| 720,001 – 1,800,000 | 60,001 – 150,000 | 15% |
| 1,800,001 – 3,000,000 | 150,001 – 250,000 | 20% |
| 3,000,001 – 5,400,000 | 250,001 – 450,000 | 30% |
| > 5,400,000 | > 450,000 | 35% |

### Payroll journal on `POST /payroll-runs/:id/post`
```
DR  Salary Expense            (sum of all gross salaries)
DR  NASSIT Expense            (sum of employer 10% contributions)
    CR  Salary Payable         (sum of net pay = gross - NASSIT emp - PAYE)
    CR  NASSIT Payable         (sum of emp 5% + employer 10%)
    CR  PAYE Payable           (sum of all PAYE deductions)
```

---

## 8. Monime Payments

**Files:**
- `apps/api/src/services/monime.service.ts` — Monime API wrapper
- `apps/api/src/modules/billing/billing.routes.ts` — Billing routes

Monime.io is Sierra Leone's mobile money payment infrastructure, supporting Orange Money, Afrimoney, and QMoney. LEDGERA uses it for:

1. **SaaS subscription billing** — businesses pay their monthly LEDGERA fee via a mobile money USSD prompt
2. **POS payment initiation** — optionally trigger a payment prompt on a customer's phone during a sale

### Billing flow (subscription)
```
1. Owner selects plan + enters phone number + network
2. POST /v1/billing/initiate → MonimeService.collectPayment()
3. Monime sends USSD prompt to phone
4. Owner approves on phone
5. Monime POSTs to /v1/billing/webhook (X-Monime-Signature verified)
6. On event="payment.successful": subscriptions row updated to status='active'
```

### Webhook signature verification
```typescript
X-Monime-Signature: sha256=<hmac-sha256(rawBody, webhookSecret)>
```

### API endpoints (`/v1/billing`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/subscription` | authenticated | Current subscription status |
| POST | `/initiate` | org_owner | Start Monime collection for subscription |
| GET | `/payment/:id` | authenticated | Poll payment status |
| POST | `/webhook` | public (sig verified) | Monime event receiver |
| POST | `/pos-payment` | cashier | Initiate Monime collection for POS sale |

---

## 9. Authentication & RBAC

**File:** `apps/api/src/middleware/auth.ts`

### JWT payload
```json
{ "sub": "user-uuid", "orgId": "org-uuid", "role": "accountant",
  "branchId": "branch-uuid|null", "iat": 0, "exp": 0 }
```

### Token strategy
- **Access token** (15m) → returned in JSON body → stored in `sessionStorage`
- **Refresh token** (7d) → stored as httpOnly cookie → exchanged at `POST /v1/auth/refresh`

### Role weights
```
super_admin=100, org_owner=90, accountant=70, branch_manager=60,
inventory_officer=50, cashier=40, employee=30, viewer=10
```
`requireMinRole('accountant')` ≡ `roleWeight[user.role] >= 70`

### Organization bootstrap (single transaction, 10 steps)
Register → hash password → create user → create org → create subscription (14-day trial) → create main branch → add org_owner membership → create org_settings → seed 26 COA accounts → create fiscal year → create 12 fiscal periods → create 5 sequences (INV, RCP, PO, EXP, JE).

---

## 10. API Reference

All routes prefixed `/v1`. Standard error: `{ code, message, details }`.

### Auth `/v1/auth`
`POST /register` · `POST /login` · `POST /refresh` · `POST /logout` · `GET /me`

### Organization `/v1/org`
`GET /` · `PATCH /` · `GET /settings` · `PATCH /settings` · `GET /subscription`  
`GET /branches` · `POST /branches` · `PATCH /branches/:id`  
`GET /users` · `PATCH /users/:id` · `POST /invite` · `POST /invite/accept`  
`POST /fiscal-periods/:id/close`

### Accounting `/v1`
`GET /accounts` · `POST /accounts` · `GET /accounts/:id` · `PATCH /accounts/:id`  
`GET /journal` · `POST /journal` · `GET /journal/:id` · `POST /journal/:id/void`  
`GET /fiscal-periods` · `GET /fiscal-years`

### Inventory `/v1`
`GET /categories` · `POST /categories`  
`GET /products` · `POST /products` · `GET /products/:id` · `PATCH /products/:id`  
`GET /products/:id/movements` · `POST /stock/adjust`

### Sales `/v1`
`GET /sales` · `POST /sales` · `GET /sales/:id` · `POST /sales/:id/void`  
`GET /customers` · `POST /customers` · `PATCH /customers/:id`

### Purchases `/v1`
`GET /suppliers` · `POST /suppliers`  
`GET /purchase-orders` · `POST /purchase-orders` · `PATCH /purchase-orders/:id/approve`  
`GET /grns` · `POST /grns`  
`POST /supplier-payments`

### Expenses `/v1`
`GET /expense-categories` · `POST /expense-categories`  
`GET /expenses` · `POST /expenses`  
`POST /expenses/:id/submit` · `POST /expenses/:id/approve` · `POST /expenses/:id/reject`

### Payroll `/v1`
`GET /departments` · `POST /departments`  
`GET /employees` · `POST /employees` · `PATCH /employees/:id`  
`GET /payroll-runs` · `POST /payroll-runs` · `POST /payroll-runs/:id/post`  
`GET /payroll-runs/:id/payslips` · `GET /payslips/:id`

### Banking `/v1`
`GET /bank-accounts` · `POST /bank-accounts` · `GET /bank-accounts/:id`  
`GET /bank-accounts/:id/transactions` · `POST /bank-accounts/:id/transactions`  
`GET /momo-wallets` · `POST /momo-wallets`  
`GET /momo-wallets/:id/transactions` · `POST /momo-wallets/:id/transactions`

### Reports `/v1/reports`
`GET /profit-loss` · `GET /balance-sheet` · `GET /trial-balance`  
`GET /general-ledger` · `GET /sales-summary` · `GET /inventory-valuation`

### Billing `/v1/billing`
`GET /subscription` · `POST /initiate` · `GET /payment/:id`  
`POST /webhook` · `POST /pos-payment`

---

## 11. Frontend Architecture

### Page map
```
(auth)/login              → Email + password login
(auth)/register           → Registration + org setup wizard
(dashboard)/dashboard     → KPI cards + revenue chart + recent sales
(dashboard)/sales/pos     → Split-panel POS (products | cart + payments)
(dashboard)/sales/invoices → Invoice list with status badges
(dashboard)/purchases     → PO + GRN tabs
(dashboard)/inventory     → Product list with stock + low-stock badge
(dashboard)/inventory/new → Product creation form
(dashboard)/inventory/[id] → Product detail + edit + stock movements
(dashboard)/customers     → Customer list + add form
(dashboard)/expenses      → Expense list + submit/approve
(dashboard)/payroll       → Payroll runs + employees tabs
(dashboard)/mobile-money  → MoMo wallets + transaction recording
(dashboard)/banking       → Bank accounts + transaction recording
(dashboard)/accounting/journal → Journal entry list + manual entry form
(dashboard)/reports       → P&L / Balance Sheet / Trial Balance / Inventory tabs
(dashboard)/settings      → Org info + Tax settings + Monime billing
```

### State management
- **`auth.store.ts`** — Zustand + localStorage persistence. Access token in `sessionStorage` (tab-scoped). User object in `localStorage`.
- **`pos.store.ts`** — Zustand in-memory. Cart lines, payments, computed `subtotal()`, `taxTotal()`, `grandTotal()`, `changeDue()`.

### API client
`BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'`  
Auto-injects `Authorization: Bearer <token>` from sessionStorage. Throws `APIError` on non-2xx.

### Auth guard
`src/middleware.ts` — checks `refresh_token` cookie. Redirects to `/login?next=<path>` if missing. Allows: `/login`, `/register`, `/forgot-password`, `/_next`, `/api`, `/favicon.ico`.

---

## 12. Subscription Plans

| Plan | SLE/month | Users | Branches | Products |
|---|---|---|---|---|
| Starter | 500,000 | 3 | 1 | 500 |
| Growth | 1,200,000 | 10 | 3 | 5,000 |
| Business | 2,500,000 | 25 | 10 | 50,000 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

New orgs: **14-day free trial** on Starter. Payments via Monime (mobile money). Webhook activates subscription on `payment.successful`.

---

## 13. Running Locally

No containers — everything runs natively. Full step-by-step is in `DEV_SETUP.md`; summary:

```bash
# 1. Install
git clone <repo> && cd ledgera
pnpm install

# 2. Infrastructure (native — brew install postgresql@15 redis, or a cloud DB/Redis)
brew services start postgresql@15
brew services start redis
psql -U $(whoami) -c "CREATE USER ledgera WITH PASSWORD 'ledgera_dev';"
psql -U $(whoami) -c "CREATE DATABASE ledgera_dev OWNER ledgera;"
psql -U $(whoami) -d ledgera_dev -f scripts/postgres-init.sql   # extensions + ledgera_app/ledgera_bypass roles

# 3. Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Set JWT_SECRET in apps/api/.env (any 64-char hex string)

# 4. Database
pnpm --filter @ledgera/db db:generate   # generate SQL migration files
pnpm --filter @ledgera/db db:migrate    # apply to Postgres, via DATABASE_MIGRATOR_URL

# 5. (Optional) Seed
pnpm --filter @ledgera/db db:seed

# 6. Dev
pnpm dev   # API on :3001, Web on :3000

# URLs
# App: http://localhost:3000
# API: http://localhost:3001/health
```

### Deploying to a server

`scripts/deploy.sh <saas|dedicated> [--domain=example.com] [--db-name=name]`
does the rest on an actual server — installs Node/pnpm/PostgreSQL/Redis/
Caddy/pm2 if missing, sets up the three DB roles, generates `.env`,
migrates, seeds a default user per RBAC role on a fresh database (see
`packages/db/src/seed-default-users.ts` — one-time only, credentials
printed + saved to `.ledgera-default-users.txt`), builds, and runs both
processes under pm2 (with Caddy as reverse proxy + automatic HTTPS if
`--domain` is given). No Docker. Idempotent — same command for the first
deploy and every redeploy after. See
`docs/runbooks/provision-dedicated-instance.md` for the full walkthrough.

---

## 14. Environment Variables

### `apps/api/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN |
| `REDIS_URL` | Redis DSN |
| `JWT_SECRET` | 64-byte hex — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `APP_URL` | Frontend URL (for CORS) |
| `API_URL` | This API's public URL (used in Monime callback URL) |
| `MONIME_API_KEY` | From dashboard.monime.io → Settings → API Keys |
| `MONIME_WEBHOOK_SECRET` | Monime webhook signing secret |
| `MONIME_ENV` | `sandbox` or `production` |
| `SMTP_HOST / SMTP_PORT / SMTP_FROM` | Email delivery |
| `STORAGE_DRIVER` | `local` (dev) or `s3` (prod) |
| `AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY` | S3 for prod file storage |

### `apps/web/.env`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL — `http://localhost:3001` in dev |

---

## 15. Permission Matrix

Roles: `super_admin > org_owner > accountant > branch_manager > inventory_officer > cashier > employee > viewer`

| Action | Minimum role |
|---|---|
| Edit org / settings | org_owner |
| Invite users | org_owner |
| Manage billing | org_owner |
| View / post journals | accountant |
| Close fiscal period | accountant |
| Run payroll | accountant |
| Post payroll | org_owner |
| Approve expenses | branch_manager |
| Approve purchase orders | branch_manager |
| Void a sale | branch_manager |
| Receive GRN | inventory_officer |
| Create / edit products | inventory_officer |
| Manual stock adjustment | inventory_officer |
| Create a sale | cashier |
| Create an expense | employee |
| View own payslip | employee |
| View reports (P&L, BS) | viewer (read-only) |

Full table with all 8 roles × 12 modules is in `architecture/07-permission-matrix.md` (archived) or implemented in `apps/api/src/middleware/auth.ts`.

---

## 16. Roadmap

### Phase 1 — Complete ✅
Auth + RBAC · Chart of accounts · Double-entry journal engine · Sales/POS · Purchases (PO + GRN) · Inventory (weighted avg + FIFO) · Customers · Expenses · Payroll (NASSIT + PAYE) · Banking · Mobile Money · Reports · Manual journals · Period close · User invites · Monime billing · Settings

### Phase 2 — Next
- [ ] PDF payslip download
- [ ] PDF + Excel report export
- [ ] Offline POS (service worker + IndexedDB sync queue)
- [ ] WhatsApp / SMS receipts (Africa's Talking)
- [ ] 2FA verify endpoint (`POST /v1/auth/verify-2fa`)
- [ ] Google OAuth login
- [ ] Purchase invoice creation (separate from GRN)
- [ ] Stock count reconciliation
- [ ] Inter-branch stock transfers
- [ ] Camera barcode scanner in POS

### Phase 3
- [ ] React Native mobile app
- [ ] Bank statement import + reconciliation
- [ ] Custom report builder
- [ ] French + Krio localization
- [ ] Multi-currency (USD/GBP/EUR) on Business plan
- [ ] Subscription enforcement middleware (plan limits)

### Phase 4 — Enterprise
- [ ] REST webhooks for third-party integrations
- [ ] Bill of Materials
- [ ] Fixed asset depreciation module
- [ ] Multi-company consolidation
- [ ] Dedicated account manager + SLA
