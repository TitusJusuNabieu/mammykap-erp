# Development Setup

LEDGERA runs entirely on native services — no containers required. You need
**PostgreSQL 15** and **Redis 7**, running locally or via a cloud service.

## Option 1: Native (macOS with Homebrew)

```bash
# Install
brew install postgresql@15 redis

# Start services
brew services start postgresql@15
brew services start redis

# Create the schema-owner role + database
psql -U $(whoami) -c "CREATE USER ledgera WITH PASSWORD 'ledgera_dev';"
psql -U $(whoami) -c "CREATE DATABASE ledgera_dev OWNER ledgera;"
psql -U $(whoami) -c "GRANT ALL PRIVILEGES ON DATABASE ledgera_dev TO ledgera;"

# Create the runtime roles (RLS-restricted app role + BYPASSRLS admin role)
# and the required Postgres extensions — see scripts/postgres-init.sql
psql -U $(whoami) -d ledgera_dev -f scripts/postgres-init.sql
```

## Option 2: Cloud (recommended for teams)

- **PostgreSQL**: [Supabase](https://supabase.com) (free tier) or [Neon](https://neon.tech) (free tier, serverless)
- **Redis**: [Upstash](https://upstash.com) (free tier, serverless Redis)

Copy the connection strings into your `.env` files. You'll still need to run
the role/extension setup in `scripts/postgres-init.sql` once against the
cloud database (most providers give you a SQL console or `psql` access for
this) before migrating.

## Environment files

**`apps/api/.env`** — three separate roles power Row-Level Security (see
`packages/db/src/migrations/0003_row_level_security.sql`):

```
DATABASE_URL=postgres://ledgera_app:ledgera_app_dev@localhost:5432/ledgera_dev
DATABASE_ADMIN_URL=postgres://ledgera_bypass:ledgera_bypass_dev@localhost:5432/ledgera_dev
DATABASE_MIGRATOR_URL=postgres://ledgera:ledgera_dev@localhost:5432/ledgera_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-random-secret-here
DEPLOYMENT_MODE=saas
PORT=3001
NODE_ENV=development
APP_URL=http://localhost:3000
```

**`apps/web/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Run migrations

```bash
cd packages/db
pnpm db:generate   # generate SQL migration files from schema changes
pnpm db:migrate    # apply to Postgres, via DATABASE_MIGRATOR_URL
pnpm db:seed       # (optional) seed with sample data
```

## Start dev servers

```bash
# From project root
pnpm dev       # starts both api (3001) and web (3000)
```

## Email in dev

Outbound email isn't required to run the app locally — nothing currently
sends real email (invite/verification emails are stubbed, see LEDGERA.md
roadmap). If you want to see what would be sent, point `SMTP_HOST`/`SMTP_PORT`
at a local catch-all like [Mailpit](https://github.com/axllent/mailpit)
(`brew install mailpit && mailpit`, UI at http://localhost:8025) or
[MailHog](https://github.com/mailhog/MailHog).
