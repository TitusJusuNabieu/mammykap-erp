-- LEDGERA PostgreSQL initialization
--
-- Usage: psql -v dbname="$DB_NAME" -v app_pass="$APP_PASS" -v bypass_pass="$BYPASS_PASS" \
--             -d "$DB_NAME" -f scripts/postgres-init.sql
--
-- dbname is required. app_pass/bypass_pass are optional — if not passed with
-- -v, they default to the values below (fine for local dev, never for a real
-- deployment; scripts/deploy.sh always generates and passes real ones).
-- This lets the same file work against any database name/credentials —
-- local dev, the shared SaaS DB, or a dedicated customer's own DB.
--
-- Note: psql variable substitution (:'var') does not work inside DO $$ $$
-- blocks, so role creation below uses \gset + \if with plain top-level SQL
-- instead of a plpgsql DO block.

\if :{?app_pass}
\else
  \set app_pass 'ledgera_app_dev'
\endif
\if :{?bypass_pass}
\else
  \set bypass_pass 'ledgera_bypass_dev'
\endif

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Row-Level Security roles ────────────────────────────────────────────────
-- ledgera_app     — ordinary least-privilege runtime role. Subject to RLS.
--                   Used for all normal per-request API traffic.
-- ledgera_bypass  — has BYPASSRLS. Used only for legitimately cross-tenant
--                   queries: pre-auth lookups, webhooks, super_admin tooling.
SELECT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ledgera_app') AS app_exists \gset
\if :app_exists
  \echo 'ledgera_app already exists, skipping'
\else
  CREATE ROLE ledgera_app LOGIN PASSWORD :'app_pass';
\endif

SELECT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ledgera_bypass') AS bypass_exists \gset
\if :bypass_exists
  \echo 'ledgera_bypass already exists, skipping'
\else
  CREATE ROLE ledgera_bypass LOGIN PASSWORD :'bypass_pass' BYPASSRLS;
\endif

GRANT ALL PRIVILEGES ON DATABASE :"dbname" TO ledgera_app, ledgera_bypass;
GRANT ALL PRIVILEGES ON SCHEMA public TO ledgera_app, ledgera_bypass;
