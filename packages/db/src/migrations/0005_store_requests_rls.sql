-- RLS for the store-request/daily-close/access-log tables added in 0004.
-- Same defense-in-depth pattern as 0003_row_level_security.sql — see that
-- file's header for the full explanation of app.current_org_id.

-- ── Directly organization-scoped tables (organization_id NOT NULL) ────────
DO $$
DECLARE
  tbl text;
  org_scoped_tables text[] := ARRAY[
    'store_requests','store_request_supplies','store_request_rejections','daily_closes'
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

-- ── Nullable-organization_id tables (some rows are pre-auth/platform-level) ──
DO $$
DECLARE
  tbl text;
  nullable_org_tables text[] := ARRAY['access_logs'];
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
ALTER TABLE store_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_request_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_request_lines
  USING (EXISTS (
    SELECT 1 FROM store_requests sr
    WHERE sr.id = store_request_lines.store_request_id
      AND sr.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM store_requests sr
    WHERE sr.id = store_request_lines.store_request_id
      AND sr.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

ALTER TABLE store_request_supply_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_request_supply_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_request_supply_lines
  USING (EXISTS (
    SELECT 1 FROM store_request_supplies srs
    WHERE srs.id = store_request_supply_lines.store_request_supply_id
      AND srs.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM store_request_supplies srs
    WHERE srs.id = store_request_supply_lines.store_request_supply_id
      AND srs.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

ALTER TABLE store_request_rejection_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_request_rejection_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_request_rejection_lines
  USING (EXISTS (
    SELECT 1 FROM store_request_rejections srj
    WHERE srj.id = store_request_rejection_lines.store_request_rejection_id
      AND srj.organization_id = current_setting('app.current_org_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM store_request_rejections srj
    WHERE srj.id = store_request_rejection_lines.store_request_rejection_id
      AND srj.organization_id = current_setting('app.current_org_id', true)::uuid
  ));

-- ── Grants ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgera_app, ledgera_bypass;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgera_app, ledgera_bypass;
