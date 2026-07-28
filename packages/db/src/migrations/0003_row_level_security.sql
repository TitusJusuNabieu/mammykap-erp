-- Tenant isolation via Postgres Row-Level Security.
--
-- This is defense-in-depth: additive to the existing application-level
-- `eq(organizationId, orgId)` filters already present in every route
-- handler, not a replacement for them. The session variable
-- `app.current_org_id` is set once per request via
-- `SELECT set_config('app.current_org_id', $1, true)` inside a
-- transaction opened right after JWT verification — see
-- apps/api/src/plugins/tenant-context.ts.
--
-- Requires the `ledgera_app` and `ledgera_bypass` roles to already exist
-- (see scripts/postgres-init.sql for local dev; staging/prod create them
-- once via the managed DB's master credentials). `ledgera_bypass` has the
-- BYPASSRLS attribute, so it is unaffected by every policy below without
-- needing an explicit `TO` clause.

-- ── Directly organization-scoped tables (organization_id NOT NULL) ────────
DO $$
DECLARE
  tbl text;
  org_scoped_tables text[] := ARRAY[
    'fiscal_years','fiscal_periods','accounts','journal_entries','journal_lines','exchange_rates',
    'expense_categories','expenses','petty_cash_funds','petty_cash_transactions',
    'bank_accounts','bank_transactions','mobile_money_wallets','mobile_money_transactions',
    'categories','units','products','product_variants','stock_levels','stock_batches',
    'stock_movements','stock_transfers',
    'subscriptions','branches',
    'departments','employees','salary_structures','payroll_runs','payslips',
    'suppliers','purchase_orders','purchase_order_lines','goods_received_notes',
    'purchase_invoices','supplier_payments',
    'quotes','quote_lines',
    'customers','sales','sale_lines','sale_payments','sale_returns','customer_payments',
    'organization_settings','sequences',
    'organization_users','org_invitations'
  ];
BEGIN
  FOREACH tbl IN ARRAY org_scoped_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = current_setting(''app.current_org_id'', true)::uuid)
         WITH CHECK (organization_id = current_setting(''app.current_org_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- ── organizations: no organization_id column — it IS the tenant ──────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- ── Nullable-organization_id tables (some rows are platform-level) ───────
DO $$
DECLARE
  tbl text;
  nullable_org_tables text[] := ARRAY['audit_logs','notifications','user_sessions'];
BEGIN
  FOREACH tbl IN ARRAY nullable_org_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id IS NULL OR organization_id = current_setting(''app.current_org_id'', true)::uuid)
         WITH CHECK (organization_id IS NULL OR organization_id = current_setting(''app.current_org_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- ── Parent-scoped line tables (no organization_id column of their own) ───
-- These 4 tables denormalize nothing — they're scoped transitively through
-- their parent row's organization_id via an EXISTS subquery.
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_transfer_lines
  USING (EXISTS (
    SELECT 1 FROM stock_transfers st
    WHERE st.id = stock_transfer_lines.transfer_id
      AND st.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM stock_transfers st
    WHERE st.id = stock_transfer_lines.transfer_id
      AND st.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

ALTER TABLE grn_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grn_lines
  USING (EXISTS (
    SELECT 1 FROM goods_received_notes grn
    WHERE grn.id = grn_lines.grn_id
      AND grn.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM goods_received_notes grn
    WHERE grn.id = grn_lines.grn_id
      AND grn.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

ALTER TABLE salary_structure_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structure_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON salary_structure_lines
  USING (EXISTS (
    SELECT 1 FROM salary_structures ss
    WHERE ss.id = salary_structure_lines.structure_id
      AND ss.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM salary_structures ss
    WHERE ss.id = salary_structure_lines.structure_id
      AND ss.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

ALTER TABLE employee_salary_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_salary_assignments
  USING (EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_salary_assignments.employee_id
      AND e.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_salary_assignments.employee_id
      AND e.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

-- ── Grants ─────────────────────────────────────────────────────────────
-- Policies apply to all non-bypass, non-owner roles by default (no `TO`
-- clause = TO PUBLIC). ledgera_bypass skips every policy above via its
-- BYPASSRLS role attribute.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgera_app, ledgera_bypass;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgera_app, ledgera_bypass;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgera_app, ledgera_bypass;
