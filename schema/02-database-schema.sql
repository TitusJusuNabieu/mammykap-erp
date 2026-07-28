-- ============================================================
-- LEDGERA — Complete Database Schema
-- Engine: PostgreSQL 15+
-- Architecture: Multi-tenant via organization_id on every table
-- ============================================================

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy product search

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
CREATE TYPE account_type      AS ENUM ('asset','liability','equity','revenue','expense');
CREATE TYPE entry_status      AS ENUM ('draft','posted','voided');
CREATE TYPE payment_method    AS ENUM ('cash','bank','orange_money','afrimoney','qmoney','cheque','credit');
CREATE TYPE invoice_status    AS ENUM ('draft','sent','partial','paid','overdue','cancelled');
CREATE TYPE po_status         AS ENUM ('draft','sent','partial','received','cancelled');
CREATE TYPE stock_method      AS ENUM ('fifo','weighted_average');
CREATE TYPE transfer_status   AS ENUM ('pending','in_transit','received','cancelled');
CREATE TYPE payroll_status    AS ENUM ('draft','processing','completed','cancelled');
CREATE TYPE subscription_plan AS ENUM ('starter','growth','business','enterprise');
CREATE TYPE subscription_status AS ENUM ('trialing','active','past_due','cancelled','paused');
CREATE TYPE user_role         AS ENUM ('super_admin','org_owner','accountant','branch_manager','inventory_officer','cashier','employee','viewer');
CREATE TYPE expense_status    AS ENUM ('draft','submitted','approved','rejected','paid');
CREATE TYPE notification_channel AS ENUM ('in_app','email','sms','whatsapp','push');
CREATE TYPE audit_action      AS ENUM ('create','update','delete','void','login','logout','export','print');
CREATE TYPE currency_code     AS ENUM ('SLE','USD','GBP','EUR','NGN','GHS','XOF');

-- ─────────────────────────────────────────
-- ORGANIZATIONS (TENANTS)
-- ─────────────────────────────────────────
CREATE TABLE organizations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,
    logo_url            TEXT,
    address             TEXT,
    phone               VARCHAR(30),
    email               VARCHAR(255),
    website             VARCHAR(255),
    tin                 VARCHAR(50),                   -- Tax Identification Number
    registration_number VARCHAR(100),
    base_currency       currency_code NOT NULL DEFAULT 'SLE',
    fiscal_year_start   DATE NOT NULL DEFAULT '2024-01-01',
    stock_valuation_method stock_method NOT NULL DEFAULT 'weighted_average',
    timezone            VARCHAR(50) NOT NULL DEFAULT 'Africa/Freetown',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    plan                subscription_plan NOT NULL DEFAULT 'starter',
    status              subscription_status NOT NULL DEFAULT 'trialing',
    trial_ends_at       TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end  TIMESTAMPTZ NOT NULL,
    cancelled_at        TIMESTAMPTZ,
    max_users           INT NOT NULL DEFAULT 3,
    max_branches        INT NOT NULL DEFAULT 1,
    max_products        INT NOT NULL DEFAULT 500,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- BRANCHES
-- ─────────────────────────────────────────
CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(20) NOT NULL,
    address         TEXT,
    phone           VARCHAR(30),
    email           VARCHAR(255),
    is_main_branch  BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- ─────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    password_hash       TEXT,                          -- NULL for OAuth-only users
    full_name           VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    avatar_url          TEXT,
    is_email_verified   BOOLEAN NOT NULL DEFAULT false,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_login_at       TIMESTAMPTZ,
    totp_secret         TEXT,                          -- encrypted
    totp_enabled        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            user_role NOT NULL DEFAULT 'cashier',
    branch_id       UUID REFERENCES branches(id),     -- NULL = all branches
    is_active       BOOLEAN NOT NULL DEFAULT true,
    invited_by      UUID REFERENCES users(id),
    joined_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    token_hash      TEXT NOT NULL UNIQUE,
    device_info     JSONB,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_accounts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    provider    VARCHAR(50) NOT NULL,
    provider_id TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

-- ─────────────────────────────────────────
-- FISCAL PERIODS
-- ─────────────────────────────────────────
CREATE TABLE fiscal_years (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_closed       BOOLEAN NOT NULL DEFAULT false,
    closed_at       TIMESTAMPTZ,
    closed_by       UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fiscal_periods (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    fiscal_year_id  UUID NOT NULL REFERENCES fiscal_years(id),
    name            VARCHAR(50) NOT NULL,              -- e.g. "January 2025"
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_closed       BOOLEAN NOT NULL DEFAULT false,
    closed_at       TIMESTAMPTZ,
    closed_by       UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CHART OF ACCOUNTS
-- ─────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    code            VARCHAR(20) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    account_type    account_type NOT NULL,
    parent_id       UUID REFERENCES accounts(id),
    is_system       BOOLEAN NOT NULL DEFAULT false,    -- system accounts cannot be deleted
    is_active       BOOLEAN NOT NULL DEFAULT true,
    description     TEXT,
    currency        currency_code,                     -- NULL = org base currency
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- ─────────────────────────────────────────
-- JOURNAL ENTRIES (DOUBLE ENTRY CORE)
-- ─────────────────────────────────────────
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    branch_id       UUID REFERENCES branches(id),
    fiscal_period_id UUID REFERENCES fiscal_periods(id),
    entry_number    VARCHAR(50) NOT NULL,
    date            DATE NOT NULL,
    description     TEXT NOT NULL,
    status          entry_status NOT NULL DEFAULT 'draft',
    source_type     VARCHAR(50),                       -- 'sale','purchase','payroll','expense', etc.
    source_id       UUID,                              -- FK to the originating record
    posted_at       TIMESTAMPTZ,
    posted_by       UUID REFERENCES users(id),
    voided_at       TIMESTAMPTZ,
    voided_by       UUID REFERENCES users(id),
    void_reason     TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, entry_number)
);

CREATE TABLE journal_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id    UUID NOT NULL REFERENCES journal_entries(id),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    account_id          UUID NOT NULL REFERENCES accounts(id),
    description         TEXT,
    debit               NUMERIC(18,4) NOT NULL DEFAULT 0,
    credit              NUMERIC(18,4) NOT NULL DEFAULT 0,
    currency            currency_code NOT NULL,
    exchange_rate       NUMERIC(14,6) NOT NULL DEFAULT 1,
    base_debit          NUMERIC(18,4) NOT NULL DEFAULT 0,  -- in org base currency
    base_credit         NUMERIC(18,4) NOT NULL DEFAULT 0,
    line_number         INT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_debit_credit CHECK (
        (debit >= 0 AND credit = 0) OR (credit >= 0 AND debit = 0)
    )
);

-- ─────────────────────────────────────────
-- CURRENCIES & EXCHANGE RATES
-- ─────────────────────────────────────────
CREATE TABLE exchange_rates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    from_currency   currency_code NOT NULL,
    to_currency     currency_code NOT NULL,
    rate            NUMERIC(14,6) NOT NULL,
    date            DATE NOT NULL,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, from_currency, to_currency, date)
);

-- ─────────────────────────────────────────
-- PRODUCT CATALOG & INVENTORY
-- ─────────────────────────────────────────
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    parent_id       UUID REFERENCES categories(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(50) NOT NULL,
    abbreviation    VARCHAR(10) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    category_id         UUID REFERENCES categories(id),
    unit_id             UUID REFERENCES units(id),
    sku                 VARCHAR(100),
    barcode             VARCHAR(100),
    name                VARCHAR(500) NOT NULL,
    description         TEXT,
    cost_price          NUMERIC(18,4) NOT NULL DEFAULT 0,
    selling_price       NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,    -- percentage
    is_taxable          BOOLEAN NOT NULL DEFAULT false,
    track_inventory     BOOLEAN NOT NULL DEFAULT true,
    has_expiry          BOOLEAN NOT NULL DEFAULT false,
    has_batch           BOOLEAN NOT NULL DEFAULT false,
    reorder_point       NUMERIC(12,3) NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    image_url           TEXT,
    inventory_account_id UUID REFERENCES accounts(id),
    revenue_account_id   UUID REFERENCES accounts(id),
    cogs_account_id      UUID REFERENCES accounts(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, sku),
    UNIQUE(organization_id, barcode)
);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    sku             VARCHAR(100),
    barcode         VARCHAR(100),
    attributes      JSONB NOT NULL DEFAULT '{}',   -- {"size":"L","color":"Red"}
    cost_price      NUMERIC(18,4),
    selling_price   NUMERIC(18,4),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_levels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    avg_cost        NUMERIC(18,4) NOT NULL DEFAULT 0,   -- for weighted average
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, variant_id, branch_id)
);

CREATE TABLE stock_batches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    batch_number    VARCHAR(100) NOT NULL,
    expiry_date     DATE,
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    cost_price      NUMERIC(18,4) NOT NULL DEFAULT 0,
    manufactured_date DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_movements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    product_id          UUID NOT NULL REFERENCES products(id),
    variant_id          UUID REFERENCES product_variants(id),
    batch_id            UUID REFERENCES stock_batches(id),
    movement_type       VARCHAR(50) NOT NULL,  -- 'purchase','sale','adjustment','transfer_in','transfer_out','return_in','return_out'
    source_type         VARCHAR(50),
    source_id           UUID,
    quantity            NUMERIC(12,3) NOT NULL,
    unit_cost           NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_cost          NUMERIC(18,4) NOT NULL DEFAULT 0,
    quantity_before     NUMERIC(12,3) NOT NULL DEFAULT 0,
    quantity_after      NUMERIC(12,3) NOT NULL DEFAULT 0,
    notes               TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_transfers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    transfer_number     VARCHAR(50) NOT NULL,
    from_branch_id      UUID NOT NULL REFERENCES branches(id),
    to_branch_id        UUID NOT NULL REFERENCES branches(id),
    status              transfer_status NOT NULL DEFAULT 'pending',
    notes               TEXT,
    shipped_at          TIMESTAMPTZ,
    shipped_by          UUID REFERENCES users(id),
    received_at         TIMESTAMPTZ,
    received_by         UUID REFERENCES users(id),
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, transfer_number)
);

CREATE TABLE stock_transfer_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id     UUID NOT NULL REFERENCES stock_transfers(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    batch_id        UUID REFERENCES stock_batches(id),
    quantity        NUMERIC(12,3) NOT NULL,
    received_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit_cost       NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_adjustments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    adjustment_number   VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    reason              VARCHAR(255) NOT NULL,
    notes               TEXT,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    approved_by         UUID REFERENCES users(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_adjustment_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adjustment_id       UUID NOT NULL REFERENCES stock_adjustments(id),
    product_id          UUID NOT NULL REFERENCES products(id),
    variant_id          UUID REFERENCES product_variants(id),
    system_qty          NUMERIC(12,3) NOT NULL,
    actual_qty          NUMERIC(12,3) NOT NULL,
    variance_qty        NUMERIC(12,3) GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
    unit_cost           NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    customer_number     VARCHAR(50) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    email               VARCHAR(255),
    address             TEXT,
    tin                 VARCHAR(50),
    credit_limit        NUMERIC(18,4) NOT NULL DEFAULT 0,
    current_balance     NUMERIC(18,4) NOT NULL DEFAULT 0,   -- denormalized for speed
    ar_account_id       UUID REFERENCES accounts(id),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, customer_number)
);

-- ─────────────────────────────────────────
-- SUPPLIERS
-- ─────────────────────────────────────────
CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    supplier_number     VARCHAR(50) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    email               VARCHAR(255),
    address             TEXT,
    tin                 VARCHAR(50),
    current_balance     NUMERIC(18,4) NOT NULL DEFAULT 0,
    ap_account_id       UUID REFERENCES accounts(id),
    payment_terms_days  INT NOT NULL DEFAULT 30,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, supplier_number)
);

-- ─────────────────────────────────────────
-- SALES
-- ─────────────────────────────────────────
CREATE TABLE sales (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    sale_number         VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    customer_id         UUID REFERENCES customers(id),
    fiscal_period_id    UUID REFERENCES fiscal_periods(id),
    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount_paid         NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount_due          NUMERIC(18,4) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    status              invoice_status NOT NULL DEFAULT 'draft',
    is_credit_sale      BOOLEAN NOT NULL DEFAULT false,
    notes               TEXT,
    receipt_url         TEXT,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, sale_number)
);

CREATE TABLE sale_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id         UUID NOT NULL REFERENCES sales(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    batch_id        UUID REFERENCES stock_batches(id),
    description     TEXT,
    quantity        NUMERIC(12,3) NOT NULL,
    unit_price      NUMERIC(18,4) NOT NULL,
    discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
    line_total      NUMERIC(18,4) NOT NULL,
    unit_cost       NUMERIC(18,4) NOT NULL DEFAULT 0,   -- for COGS
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sale_payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id         UUID NOT NULL REFERENCES sales(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    method          payment_method NOT NULL,
    amount          NUMERIC(18,4) NOT NULL,
    reference       VARCHAR(100),                  -- cheque no, momo transaction id
    account_id      UUID REFERENCES accounts(id),  -- which cash/bank account
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sale_returns (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    return_number       VARCHAR(50) NOT NULL,
    original_sale_id    UUID REFERENCES sales(id),
    date                DATE NOT NULL,
    reason              TEXT,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    refund_method       payment_method,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sale_return_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id       UUID NOT NULL REFERENCES sale_returns(id),
    sale_line_id    UUID REFERENCES sale_lines(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    quantity        NUMERIC(12,3) NOT NULL,
    unit_price      NUMERIC(18,4) NOT NULL,
    unit_cost       NUMERIC(18,4) NOT NULL DEFAULT 0,
    line_total      NUMERIC(18,4) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    quote_number    VARCHAR(50) NOT NULL,
    date            DATE NOT NULL,
    valid_until     DATE,
    customer_id     UUID REFERENCES customers(id),
    subtotal        NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    notes           TEXT,
    converted_to_sale_id UUID REFERENCES sales(id),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, quote_number)
);

-- ─────────────────────────────────────────
-- PURCHASES
-- ─────────────────────────────────────────
CREATE TABLE purchase_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    po_number           VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    expected_date       DATE,
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    fiscal_period_id    UUID REFERENCES fiscal_periods(id),
    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    status              po_status NOT NULL DEFAULT 'draft',
    notes               TEXT,
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, po_number)
);

CREATE TABLE purchase_order_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id           UUID NOT NULL REFERENCES purchase_orders(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    description     TEXT,
    quantity        NUMERIC(12,3) NOT NULL,
    received_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit_cost       NUMERIC(18,4) NOT NULL,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
    line_total      NUMERIC(18,4) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goods_received_notes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    grn_number          VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    po_id               UUID REFERENCES purchase_orders(id),
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    total_cost          NUMERIC(18,4) NOT NULL DEFAULT 0,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    notes               TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, grn_number)
);

CREATE TABLE grn_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grn_id          UUID NOT NULL REFERENCES goods_received_notes(id),
    po_line_id      UUID REFERENCES purchase_order_lines(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    batch_number    VARCHAR(100),
    expiry_date     DATE,
    quantity        NUMERIC(12,3) NOT NULL,
    unit_cost       NUMERIC(18,4) NOT NULL,
    line_total      NUMERIC(18,4) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_invoices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    invoice_number      VARCHAR(100) NOT NULL,
    supplier_invoice_no VARCHAR(100),
    date                DATE NOT NULL,
    due_date            DATE,
    grn_id              UUID REFERENCES goods_received_notes(id),
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    fiscal_period_id    UUID REFERENCES fiscal_periods(id),
    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount_paid         NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount_due          NUMERIC(18,4) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    status              invoice_status NOT NULL DEFAULT 'draft',
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, invoice_number)
);

CREATE TABLE supplier_payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    payment_number      VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    invoice_id          UUID REFERENCES purchase_invoices(id),
    amount              NUMERIC(18,4) NOT NULL,
    method              payment_method NOT NULL,
    reference           VARCHAR(100),
    account_id          UUID REFERENCES accounts(id),
    notes               TEXT,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, payment_number)
);

-- ─────────────────────────────────────────
-- CUSTOMER PAYMENTS (CREDIT SALES)
-- ─────────────────────────────────────────
CREATE TABLE customer_payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    payment_number      VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    sale_id             UUID REFERENCES sales(id),
    amount              NUMERIC(18,4) NOT NULL,
    method              payment_method NOT NULL,
    reference           VARCHAR(100),
    account_id          UUID REFERENCES accounts(id),
    notes               TEXT,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, payment_number)
);

-- ─────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────
CREATE TABLE expense_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    account_id      UUID REFERENCES accounts(id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID NOT NULL REFERENCES branches(id),
    expense_number      VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    category_id         UUID REFERENCES expense_categories(id),
    fiscal_period_id    UUID REFERENCES fiscal_periods(id),
    description         TEXT NOT NULL,
    amount              NUMERIC(18,4) NOT NULL,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL,
    payment_method      payment_method NOT NULL DEFAULT 'cash',
    account_id          UUID REFERENCES accounts(id),
    status              expense_status NOT NULL DEFAULT 'draft',
    attachment_url      TEXT,
    is_recurring        BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule     JSONB,
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, expense_number)
);

-- ─────────────────────────────────────────
-- PETTY CASH
-- ─────────────────────────────────────────
CREATE TABLE petty_cash_funds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    name            VARCHAR(255) NOT NULL,
    custodian_id    UUID REFERENCES users(id),
    float_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
    current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
    account_id      UUID REFERENCES accounts(id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE petty_cash_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    fund_id         UUID NOT NULL REFERENCES petty_cash_funds(id),
    txn_number      VARCHAR(50) NOT NULL,
    date            DATE NOT NULL,
    type            VARCHAR(20) NOT NULL,           -- 'replenishment','disbursement','settlement'
    amount          NUMERIC(18,4) NOT NULL,
    description     TEXT NOT NULL,
    category_id     UUID REFERENCES expense_categories(id),
    attachment_url  TEXT,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CASH ACCOUNTS (on-hand)
-- ─────────────────────────────────────────
CREATE TABLE cash_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    name            VARCHAR(255) NOT NULL,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- BANK ACCOUNTS
-- ─────────────────────────────────────────
CREATE TABLE bank_accounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID REFERENCES branches(id),
    name                VARCHAR(255) NOT NULL,
    bank_name           VARCHAR(255) NOT NULL,
    account_number      VARCHAR(100) NOT NULL,
    account_type        VARCHAR(50) NOT NULL DEFAULT 'current',
    currency            currency_code NOT NULL DEFAULT 'SLE',
    current_balance     NUMERIC(18,4) NOT NULL DEFAULT 0,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bank_transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id),
    txn_number          VARCHAR(50) NOT NULL,
    date                DATE NOT NULL,
    type                VARCHAR(30) NOT NULL,       -- 'deposit','withdrawal','transfer','fee','interest'
    description         TEXT NOT NULL,
    amount              NUMERIC(18,4) NOT NULL,
    balance_after       NUMERIC(18,4),
    is_reconciled       BOOLEAN NOT NULL DEFAULT false,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- MOBILE MONEY WALLETS
-- ─────────────────────────────────────────
CREATE TABLE mobile_money_wallets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID REFERENCES branches(id),
    provider            VARCHAR(50) NOT NULL,       -- 'orange_money','afrimoney','qmoney'
    wallet_number       VARCHAR(50) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    current_balance     NUMERIC(18,4) NOT NULL DEFAULT 0,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mobile_money_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    wallet_id       UUID NOT NULL REFERENCES mobile_money_wallets(id),
    txn_number      VARCHAR(50) NOT NULL,
    date            DATE NOT NULL,
    type            VARCHAR(30) NOT NULL,  -- 'deposit','withdrawal','transfer','fee','sale_receipt'
    description     TEXT NOT NULL,
    amount          NUMERIC(18,4) NOT NULL,
    fee_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(18,4) NOT NULL,
    external_ref    VARCHAR(100),
    is_reconciled   BOOLEAN NOT NULL DEFAULT false,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- PAYROLL
-- ─────────────────────────────────────────
CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employees (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID REFERENCES branches(id),
    department_id       UUID REFERENCES departments(id),
    user_id             UUID REFERENCES users(id),   -- if they also have a system login
    employee_number     VARCHAR(50) NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    email               VARCHAR(255),
    national_id         VARCHAR(100),
    nassit_number       VARCHAR(100),               -- Sierra Leone NASSIT
    position            VARCHAR(255),
    employment_type     VARCHAR(30) NOT NULL DEFAULT 'full_time',
    start_date          DATE NOT NULL,
    end_date            DATE,
    bank_name           VARCHAR(255),
    bank_account_number VARCHAR(100),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, employee_number)
);

CREATE TABLE salary_structures (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE salary_structure_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    structure_id        UUID NOT NULL REFERENCES salary_structures(id),
    name                VARCHAR(255) NOT NULL,
    type                VARCHAR(20) NOT NULL,        -- 'basic','allowance','deduction'
    computation_type    VARCHAR(20) NOT NULL,        -- 'fixed','percentage'
    amount              NUMERIC(18,4),
    percentage          NUMERIC(5,2),
    based_on            VARCHAR(50),                 -- 'basic' etc. for % computations
    account_id          UUID REFERENCES accounts(id),
    sequence            INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_salary_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    structure_id    UUID NOT NULL REFERENCES salary_structures(id),
    basic_salary    NUMERIC(18,4) NOT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payroll_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    branch_id           UUID REFERENCES branches(id),
    run_number          VARCHAR(50) NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    payment_date        DATE NOT NULL,
    status              payroll_status NOT NULL DEFAULT 'draft',
    total_gross         NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_net           NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_employer_nassit NUMERIC(18,4) NOT NULL DEFAULT 0,
    journal_entry_id    UUID REFERENCES journal_entries(id),
    processed_by        UUID REFERENCES users(id),
    processed_at        TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, run_number)
);

CREATE TABLE payslips (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id),
    employee_id         UUID NOT NULL REFERENCES employees(id),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    basic_salary        NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_allowances    NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(18,4) NOT NULL DEFAULT 0,
    nassit_employee     NUMERIC(18,4) NOT NULL DEFAULT 0,
    nassit_employer     NUMERIC(18,4) NOT NULL DEFAULT 0,
    paye_tax            NUMERIC(18,4) NOT NULL DEFAULT 0,
    gross_salary        NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_salary          NUMERIC(18,4) NOT NULL DEFAULT 0,
    lines               JSONB NOT NULL DEFAULT '[]',
    pdf_url             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- AUDIT LOG (IMMUTABLE)
-- ─────────────────────────────────────────
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    action          audit_action NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,
    resource_id     UUID,
    resource_number VARCHAR(100),
    changes         JSONB,                           -- {field: {from, to}}
    metadata        JSONB,                           -- {ip, user_agent, session_id}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are append-only — disable UPDATE and DELETE via policy
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ─────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    channel         notification_channel NOT NULL,
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,
    data            JSONB,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    sent_at         TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- SETTINGS & CONFIGURATION
-- ─────────────────────────────────────────
CREATE TABLE organization_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    invoice_prefix  VARCHAR(10) NOT NULL DEFAULT 'INV',
    po_prefix       VARCHAR(10) NOT NULL DEFAULT 'PO',
    receipt_prefix  VARCHAR(10) NOT NULL DEFAULT 'RCP',
    expense_prefix  VARCHAR(10) NOT NULL DEFAULT 'EXP',
    enable_tax      BOOLEAN NOT NULL DEFAULT true,
    default_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
    tax_name        VARCHAR(50) NOT NULL DEFAULT 'GST',
    tax_number      VARCHAR(100),
    enable_multi_currency BOOLEAN NOT NULL DEFAULT false,
    enable_payroll  BOOLEAN NOT NULL DEFAULT true,
    enable_momo     BOOLEAN NOT NULL DEFAULT true,
    low_stock_notification BOOLEAN NOT NULL DEFAULT true,
    whatsapp_receipts BOOLEAN NOT NULL DEFAULT false,
    sms_receipts    BOOLEAN NOT NULL DEFAULT false,
    pos_auto_print  BOOLEAN NOT NULL DEFAULT true,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────

-- Journal performance
CREATE INDEX idx_journal_entries_org_date ON journal_entries(organization_id, date);
CREATE INDEX idx_journal_entries_source ON journal_entries(source_type, source_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id, journal_entry_id);
CREATE INDEX idx_journal_lines_org ON journal_lines(organization_id);

-- Inventory performance
CREATE INDEX idx_stock_levels_product_branch ON stock_levels(product_id, branch_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(organization_id, product_id, created_at);
CREATE INDEX idx_products_org_sku ON products(organization_id, sku);
CREATE INDEX idx_products_barcode ON products(organization_id, barcode);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- Sales performance
CREATE INDEX idx_sales_org_date ON sales(organization_id, date);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sale_lines_sale ON sale_lines(sale_id);
CREATE INDEX idx_sale_lines_product ON sale_lines(product_id);

-- Purchase performance
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);

-- Customer/Supplier
CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_suppliers_org ON suppliers(organization_id);

-- Audit
CREATE INDEX idx_audit_logs_org_time ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Sessions
CREATE INDEX idx_sessions_user ON user_sessions(user_id, expires_at);
