# Provisioning a Dedicated Instance

LEDGERA ships in two deployment modes from the same codebase:

- **SaaS** (`DEPLOYMENT_MODE=saas`) — today's multi-tenant deployment. Subscription
  billed monthly/yearly via Monime, enforced by `middleware/subscription.ts`.
- **Dedicated** (`DEPLOYMENT_MODE=dedicated`) — a fully isolated, single-tenant
  instance for a business that wants full control. We host it, it has its own
  database and (optionally) its own domain, and it's billed by a custom
  contract outside the app rather than per-seat Monime billing.

Application code does **not** fork between the two modes — every
subscription/plan-limit check in `middleware/subscription.ts` and the grace-period
job in `jobs/subscription-grace-period.ts` no-ops entirely when
`DEPLOYMENT_MODE=dedicated`. What actually delivers "absolute control" is
infrastructure isolation: a dedicated customer gets their own Postgres database
and their own running instance, never sharing rows, a connection pool, or
downtime with any other customer.

`scripts/deploy.sh` automates everything below except DNS, the customer's
first org, and — for a genuinely dedicated instance — the compute itself.
No Docker anywhere; it installs and runs everything natively (Node, pnpm,
PostgreSQL, Redis, Caddy, pm2).

## Steps

1. **Infra**: provision a new server (VM or bare metal) for this customer —
   this is the one step the script can't do for you. Get the LEDGERA repo
   onto it (git clone, rsync, whatever you already use) and point a domain
   (or subdomain) at its IP if the customer wants a custom URL.

2. **Run the deploy script** on that server:

   ```bash
   ./scripts/deploy.sh dedicated --domain=acme.ledgera.com --db-name=ledgera_acme
   ```

   This single command: installs Node/pnpm/PostgreSQL/Redis/Caddy/pm2 if not
   already present; creates the `ledgera` (schema owner), `ledgera_app`
   (RLS-restricted), and `ledgera_bypass` (BYPASSRLS) roles plus a dedicated
   `ledgera_acme` database (via `scripts/postgres-init.sql`); generates
   `apps/api/.env` with a unique, freshly-generated `JWT_SECRET` and
   `DEPLOYMENT_MODE=dedicated` (Monime keys left blank — billing is by
   contract, not in-app mobile money); runs migrations, including the RLS
   policies (harmless for a single-tenant database, kept for consistency —
   no forked migration path to maintain); **on a genuinely empty database,
   seeds a starter org with one default user per RBAC role** (see below);
   builds the web app; and starts both processes under pm2. If `--domain`
   is given, it also configures Caddy as a reverse proxy — Caddy requests
   HTTPS certs automatically the moment DNS for the domain (and its `api.`
   subdomain) resolves to this server.

   Safe to re-run — every step checks existing state first. A second run
   (e.g. after `git pull`ing an update) reinstalls dependencies, re-migrates,
   rebuilds, and does a `pm2 reload` without touching secrets, roles, or data.

3. **Default test users**: the first deploy on an empty database creates
   "LEDGERA Starter Org" with 8 users — one per role (`super_admin`,
   `org_owner`, `accountant`, `branch_manager`, `inventory_officer`,
   `cashier`, `employee`, `viewer`), logins like `accountant@ledgera.local`.
   Randomly generated passwords are printed once and saved to
   `.ledgera-default-users.txt` in the repo root (gitignored, `chmod 600`) —
   use these to verify the deployment end-to-end (step 4). This only ever
   fires once, on an empty `organizations` table, so it never re-runs or
   interferes once the customer's real org exists — but for a **dedicated**
   instance, delete "LEDGERA Starter Org" (and its 8 users) once you're done
   verifying, before handing off: a real customer shouldn't see a leftover
   test org in their otherwise single-tenant database.

4. **Seed the organization**: register the customer's first `org_owner`
   through the normal `/v1/auth/register` flow (or a one-off seed script),
   then set that org's `subscriptions` row to `plan='enterprise'`,
   `status='active'`, and a `currentPeriodEnd` far in the future (e.g. +100
   years) so any UI that happens to read plan/status still behaves sensibly.

5. **Cut over**: confirm DNS resolves, TLS is live (if using `--domain`), and
   login/refresh/a few core flows work end-to-end before handing off.

6. **Record it**: add the instance to your internal dedicated-customer
   registry (host, database location, contract terms, contacts). Support
   access to a dedicated instance requires its own credentials — the SaaS
   deployment's `super_admin` tooling (`/v1/admin/*`) has no visibility into
   an isolated dedicated database by design.

## Redeploying an update

```bash
git pull                      # or however you get new code onto this server
./scripts/deploy.sh dedicated --domain=acme.ledgera.com --db-name=ledgera_acme
```

Same command as initial provisioning — it's idempotent, so this is also the
routine "ship an update" workflow for both dedicated instances and the SaaS
deployment itself (`./scripts/deploy.sh saas --domain=app.ledgera.com`).

## Decommissioning

Snapshot the database per the contract's data-retention terms
(`pg_dump ledgera_acme`), then `pm2 delete ledgera-api ledgera-web`, remove
the Caddy site file from `/etc/caddy/conf.d/`, tear down compute, and revoke
DNS. Nothing in the shared SaaS deployment references a dedicated instance,
so there's no cleanup required on that side.
