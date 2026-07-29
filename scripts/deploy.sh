#!/usr/bin/env bash
#
# LEDGERA server deploy script — no Docker. Targets Debian/Ubuntu (apt-based).
#
# Assumes the repo is already checked out on the server at its current
# location (this script does not touch git — see DEV_SETUP.md / the
# provisioning runbook for getting code onto the server).
#
# Usage:
#   ./scripts/deploy.sh <saas|dedicated> [--domain=example.com] [--db-name=ledgera_prod]
#                        [--api-port=3001] [--web-port=3000] [--force]
#
# Examples:
#   ./scripts/deploy.sh saas --domain=app.ledgera.com
#   ./scripts/deploy.sh dedicated --domain=acme.ledgera.com --db-name=ledgera_acme
#   ./scripts/deploy.sh dedicated                      # no domain — reachable on :3000/:3001 only
#
# Running multiple instances on one server (e.g. saas + dedicated, or several
# dedicated clients): use a SEPARATE git checkout per instance and give each
# a distinct --db-name (the pm2 process names and Caddy site file are derived
# from it) and, if their default ports would collide, distinct --api-port /
# --web-port. Example for a second instance on the same box:
#   ./scripts/deploy.sh dedicated --domain=acme.ledgera.com \
#     --db-name=ledgera_acme --api-port=3011 --web-port=3010
#
# Safe to re-run: every step below checks for existing state before acting.
# Re-running never regenerates secrets, drops data, or re-creates roles that
# already exist. If a checkout was already deployed and you pass a different
# --mode/--api-port/--web-port than what it's actually running, the script
# refuses to continue (those flags are silently ignored on redeploy since
# .env is never rewritten) — pass --force to acknowledge and proceed with the
# EXISTING values instead.

set -euo pipefail

# Under `set -e`, a failing command normally just exits the script with
# whatever (possibly nothing) that command itself printed — which is how
# this script has twice now failed with zero visible output on unusual
# server images. This trap guarantees that can't happen again: any command
# that fails prints the exact line number and command text before exiting,
# no matter what the failure actually is.
trap 'echo "✗ deploy.sh failed at line $LINENO: $BASH_COMMAND" >&2' ERR

# ── Args ─────────────────────────────────────────────────────────────────
MODE="${1:-}"
if [[ "$MODE" != "saas" && "$MODE" != "dedicated" ]]; then
  echo "Usage: $0 <saas|dedicated> [--domain=example.com] [--db-name=name]" >&2
  exit 1
fi
shift

DOMAIN=""
DB_NAME="ledgera_${MODE}"
API_PORT="3001"
WEB_PORT="3000"
FORCE="0"
for arg in "$@"; do
  case "$arg" in
    --domain=*) DOMAIN="${arg#*=}" ;;
    --db-name=*) DB_NAME="${arg#*=}" ;;
    --api-port=*) API_PORT="${arg#*=}" ;;
    --web-port=*) WEB_PORT="${arg#*=}" ;;
    --force) FORCE="1" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# Instance name — distinguishes this checkout's pm2 processes and Caddy site
# file from any other LEDGERA instance on the same host. Derived from
# --db-name so multi-instance hosting (see header comment) needs no extra flag.
INSTANCE="${DB_NAME#ledgera_}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV="$REPO_ROOT/apps/api/.env"
WEB_ENV="$REPO_ROOT/apps/web/.env.production.local"

log()  { echo -e "\n\033[1;34m▸ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠ $*\033[0m" >&2; }
die()  { echo -e "\033[1;31m✗ $*\033[0m" >&2; exit 1; }

if [[ "$(uname -s)" != "Linux" ]] || ! command -v apt-get >/dev/null 2>&1; then
  warn "This script targets Debian/Ubuntu (apt-based). Detected: $(uname -s)."
  warn "System-dependency install steps below will likely fail — install Node 22, pnpm, PostgreSQL 15, Redis (and Caddy, if using --domain) manually first, then re-run."
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "Not running as root and sudo is not available."
  SUDO="sudo"
fi

# Switching to the 'postgres' OS user for peer auth is an identity change,
# not a privilege escalation, so it's needed even when already running as
# root — but it must NOT depend on the separate `sudo` package being
# installed, which many minimal/root-only server images don't ship (you're
# already root, so there's never a reason to have installed it). `runuser`
# is part of util-linux and is present on essentially every real Linux
# server, root or not, so use that to switch identity instead; only fall
# back to `sudo -u postgres` (re-using the already-validated $SUDO) when
# not root, matching the check above.
if [[ "$(id -u)" -eq 0 ]]; then
  command -v runuser >/dev/null 2>&1 || die "runuser is required (part of util-linux) to run psql as the postgres OS user."
  PG_SUDO="runuser -u postgres --"
else
  PG_SUDO="sudo -u postgres"
fi

# ── 0. Reconcile against an existing deploy of this checkout ─────────────
# .env files are only ever generated once (see setup_env) and never rewritten,
# so if this checkout was already deployed, MODE/API_PORT/WEB_PORT/INSTANCE
# below get overwritten with whatever's actually running rather than what was
# just passed on the command line — unless it's the first deploy, or --force
# was given to knowingly re-point this checkout at different values.
resolve_existing_env() {
  [[ ! -f "$API_ENV" ]] && return 0

  local existing_mode existing_port existing_instance existing_web_port
  existing_mode="$(grep -oP '(?<=^DEPLOYMENT_MODE=).*' "$API_ENV" 2>/dev/null || true)"
  existing_port="$(grep -oP '(?<=^PORT=).*' "$API_ENV" 2>/dev/null || true)"
  existing_instance="$(grep -oP '(?<=^INSTANCE_NAME=).*' "$API_ENV" 2>/dev/null || true)"
  existing_web_port="$(grep -oP '(?<=^WEB_PORT=).*' "$WEB_ENV" 2>/dev/null || true)"

  local mismatches=()
  [[ -n "$existing_mode" && "$existing_mode" != "$MODE" ]] && \
    mismatches+=("mode: deployed as '$existing_mode', you passed '$MODE' — this flips billing/subscription enforcement")
  [[ -n "$existing_port" && "$existing_port" != "$API_PORT" ]] && \
    mismatches+=("API port: deployed on $existing_port, you passed --api-port=$API_PORT")
  [[ -n "$existing_web_port" && "$existing_web_port" != "$WEB_PORT" ]] && \
    mismatches+=("web port: deployed on $existing_web_port, you passed --web-port=$WEB_PORT")

  if [[ "${#mismatches[@]}" -gt 0 ]]; then
    warn "This checkout was already deployed with different settings than what you just passed:"
    for m in "${mismatches[@]}"; do warn "  - $m"; done
    if [[ "$FORCE" != "1" ]]; then
      die "Refusing to continue — these flags would be silently ignored (env files are never auto-rewritten). Re-run with --force to proceed using the EXISTING values, or fix your flags/directory."
    fi
    warn "--force given — proceeding with the EXISTING values above."
  fi

  # Whatever's already deployed wins, so every later step (ports, pm2 names,
  # Caddy, health check) targets what's actually running.
  [[ -n "$existing_mode" ]] && MODE="$existing_mode"
  [[ -n "$existing_port" ]] && API_PORT="$existing_port"
  [[ -n "$existing_web_port" ]] && WEB_PORT="$existing_web_port"
  [[ -n "$existing_instance" ]] && INSTANCE="$existing_instance"
  return 0
}

# ── 0b. Refuse to start on a port another LEDGERA instance already owns ──
check_ports_free() {
  command -v pm2 >/dev/null 2>&1 || return 0
  local conflict
  conflict="$(pm2 jlist 2>/dev/null | node -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      let apps;
      try { apps = JSON.parse(raw); } catch { return; }
      const wanted = { '${API_PORT}': '${API_APP}', '${WEB_PORT}': '${WEB_APP}' };
      for (const app of apps) {
        const port = app.pm2_env && app.pm2_env.PORT;
        if (port && wanted[port] && wanted[port] !== app.name) {
          console.log(\`Port \${port} is already used by pm2 app '\${app.name}' (wanted for '\${wanted[port]}')\`);
        }
      }
    });
  ")"
  # NOTE: this must stay as an `if`, not a bare `[[ ]] && die` — as the last
  # statement in the function, a bare `&&` guard whose condition evaluates
  # false (the normal/no-conflict case) makes bash treat the function ITSELF
  # as having failed under `set -e`, silently killing the whole script even
  # though nothing is actually wrong. This exact bug is what broke every
  # redeploy on a host where pm2 was already installed — see the ERR trap
  # above, which (correctly) never fires for this because it's not a real
  # error, just an artifact of how `set -e` reads a guard clause's status.
  if [[ -n "$conflict" ]]; then
    die "$conflict — pick a different --api-port/--web-port for this instance, or check --db-name is correct."
  fi
  return 0
}

# ── 0c. Warn (don't block) if --domain doesn't resolve here yet ──────────
# Caddy requests HTTPS certs automatically once DNS points at this box, but
# fails silently in the background if it doesn't — this catches the most
# common first-deploy mistake (forgetting the DNS step) before it wastes
# time chasing a cert that will never issue.
check_dns() {
  [[ -z "$DOMAIN" ]] && return 0
  command -v curl >/dev/null 2>&1 || return 0

  local server_ip resolved_ip
  server_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [[ -z "$server_ip" ]] && return 0

  resolved_ip="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)"
  if [[ -z "$resolved_ip" ]]; then
    warn "DNS for $DOMAIN doesn't resolve yet — point its A record at this server's IP ($server_ip) before (or shortly after) this finishes, or Caddy won't be able to issue an HTTPS certificate."
  elif [[ "$resolved_ip" != "$server_ip" ]]; then
    warn "$DOMAIN currently resolves to $resolved_ip, not this server ($server_ip) — HTTPS won't work until the A record is updated."
  fi
  return 0
}

# ── 1. System dependencies (idempotent — skipped if already present) ──────
install_system_deps() {
  log "Checking system dependencies"

  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js 22"
    if [[ -n "$SUDO" ]]; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    else
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    fi
    $SUDO apt-get install -y nodejs
  else
    echo "Node.js already installed: $(node --version)"
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    log "Enabling pnpm via corepack"
    $SUDO corepack enable
    local pnpm_version
    pnpm_version="$(node -pe "require('$REPO_ROOT/package.json').packageManager.split('@')[1]")"
    corepack prepare "pnpm@${pnpm_version}" --activate
  else
    echo "pnpm already installed: $(pnpm --version)"
  fi

  if ! command -v psql >/dev/null 2>&1; then
    log "Installing PostgreSQL"
    $SUDO apt-get update
    $SUDO apt-get install -y postgresql postgresql-contrib
    $SUDO systemctl enable --now postgresql
  else
    echo "PostgreSQL already installed"
  fi

  if ! command -v redis-server >/dev/null 2>&1; then
    log "Installing Redis"
    $SUDO apt-get install -y redis-server
    $SUDO systemctl enable --now redis-server
  else
    echo "Redis already installed"
  fi

  if [[ -n "$DOMAIN" ]] && ! command -v caddy >/dev/null 2>&1; then
    log "Installing Caddy"
    $SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | $SUDO gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list
    $SUDO apt-get update
    $SUDO apt-get install -y caddy
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    log "Installing pm2"
    $SUDO npm install -g pm2
  else
    echo "pm2 already installed: $(pm2 --version)"
  fi
}

# ── 2. Database + roles (idempotent via scripts/postgres-init.sql) ───────
#
# Self-healing by design: this repo's own credential files
# (.ledgera_owner_pass.$DB_NAME, and apps/api/.env once it exists) are
# always treated as the source of truth, and Postgres's actual role
# passwords are forced to match them on every run via ALTER ROLE — not
# just set once at CREATE time. Without this, any run that gets
# interrupted between "role created" and "password file written" (or
# between "password file written" and ".env generated from it") leaves
# the two permanently out of sync with no way to recover except by hand —
# which is exactly what broke the first several attempts at this deploy.
# The one case this deliberately does NOT touch: a role that already
# existed with no password file of ours for it at all (e.g. shared with
# another instance's database on the same multi-tenant host) — there we
# have no record to enforce, so it's left alone, same as before.
setup_database() {
  log "Setting up PostgreSQL database and roles ($DB_NAME)"

  local db_exists schema_owner_exists owner_pass_file owner_pass
  db_exists="$($PG_SUDO psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
  schema_owner_exists="$($PG_SUDO psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ledgera'")"
  owner_pass_file="$REPO_ROOT/.ledgera_owner_pass.$DB_NAME"

  if [[ "$schema_owner_exists" != "1" ]]; then
    log "Creating schema-owner role 'ledgera'"
    owner_pass="$(openssl rand -hex 24)"
    $PG_SUDO psql -c "CREATE ROLE ledgera LOGIN PASSWORD '${owner_pass}';"
    echo "$owner_pass" > "$owner_pass_file"
    chmod 600 "$owner_pass_file"
    warn "Schema-owner password saved to .ledgera_owner_pass.$DB_NAME (gitignored) — back this up to your secrets manager."
  elif [[ -f "$owner_pass_file" ]]; then
    log "Reconciling 'ledgera' role password with .ledgera_owner_pass.$DB_NAME"
    owner_pass="$(cat "$owner_pass_file")"
    $PG_SUDO psql -c "ALTER ROLE ledgera PASSWORD '${owner_pass}';"
  else
    warn "'ledgera' role already exists with no local password record for it (shared with another instance?) — leaving it untouched."
  fi

  if [[ "$db_exists" != "1" ]]; then
    log "Creating database '$DB_NAME'"
    $PG_SUDO psql -c "CREATE DATABASE ${DB_NAME} OWNER ledgera;"
  else
    echo "Database '$DB_NAME' already exists"
  fi

  # App/bypass role passwords: this checkout's own apps/api/.env, once it
  # exists, is the source of truth (same reasoning as owner_pass above).
  local reconcile_app_roles=0
  if [[ -f "$API_ENV" ]]; then
    APP_PASS="$(grep -oP '(?<=ledgera_app:)[^@]+' "$API_ENV" | head -1 || true)"
    BYPASS_PASS="$(grep -oP '(?<=ledgera_bypass:)[^@]+' "$API_ENV" | head -1 || true)"
    [[ -n "$APP_PASS" && -n "$BYPASS_PASS" ]] && reconcile_app_roles=1
  fi
  APP_PASS="${APP_PASS:-$(openssl rand -hex 24)}"
  BYPASS_PASS="${BYPASS_PASS:-$(openssl rand -hex 24)}"

  # Piped via stdin (< file), not `-f file` — the checkout commonly lives
  # under a directory the `postgres` OS user can't traverse (e.g. /root,
  # normally mode 700), so `psql -f` run AS postgres would fail to even
  # open the path. Redirection is set up by the shell (still root/the
  # invoking user at this point) before postgres or runuser gets involved,
  # so the already-open file descriptor sidesteps that permission check
  # entirely.
  $PG_SUDO psql -d "$DB_NAME" \
    -v dbname="$DB_NAME" -v app_pass="$APP_PASS" -v bypass_pass="$BYPASS_PASS" \
    < "$REPO_ROOT/scripts/postgres-init.sql"

  # postgres-init.sql only sets these passwords at CREATE time — if the
  # roles already existed (e.g. an earlier interrupted run, or this exact
  # scenario: .env recorded a password that was never actually applied),
  # force them to match our own recorded values now.
  if [[ "$reconcile_app_roles" == "1" ]]; then
    log "Reconciling ledgera_app/ledgera_bypass passwords with $API_ENV"
    $PG_SUDO psql -d "$DB_NAME" -c "ALTER ROLE ledgera_app PASSWORD '${APP_PASS}'; ALTER ROLE ledgera_bypass PASSWORD '${BYPASS_PASS}';"
  fi
}

# ── 3. Env files (generated once, never overwritten on redeploy) ─────────
setup_env() {
  log "Setting up environment files"

  local owner_pass
  if [[ -f "$REPO_ROOT/.ledgera_owner_pass.$DB_NAME" ]]; then
    owner_pass="$(cat "$REPO_ROOT/.ledgera_owner_pass.$DB_NAME")"
  else
    # ledgera role already existed before this run (e.g. shared across a
    # multi-database SaaS host) — the migrator URL must be filled in by
    # hand in that case.
    owner_pass="CHANGE_ME_MIGRATOR_PASSWORD"
    warn "Could not determine the 'ledgera' role password — set DATABASE_MIGRATOR_URL in $API_ENV manually."
  fi

  local app_url api_url next_api_url
  if [[ -n "$DOMAIN" ]]; then
    app_url="https://${DOMAIN}"
    api_url="https://api.${DOMAIN}"
  else
    app_url="http://localhost:${WEB_PORT}"
    api_url="http://localhost:${API_PORT}"
  fi
  next_api_url="$api_url"

  if [[ ! -f "$API_ENV" ]]; then
    log "Generating $API_ENV"
    cat > "$API_ENV" <<EOF
NODE_ENV=production
PORT=${API_PORT}
HOST=0.0.0.0

# Database — three roles, see scripts/postgres-init.sql
DATABASE_URL=postgres://ledgera_app:${APP_PASS}@localhost:5432/${DB_NAME}
DATABASE_ADMIN_URL=postgres://ledgera_bypass:${BYPASS_PASS}@localhost:5432/${DB_NAME}
DATABASE_MIGRATOR_URL=postgres://ledgera:${owner_pass}@localhost:5432/${DB_NAME}

DEPLOYMENT_MODE=${MODE}

# Distinguishes this checkout's pm2 processes / Caddy site from any other
# LEDGERA instance on this host (see scripts/deploy.sh header). Do not edit —
# changing it here does nothing since pm2 app names are set at deploy time.
INSTANCE_NAME=${INSTANCE}

REDIS_URL=redis://localhost:6379

JWT_SECRET=$(openssl rand -hex 64)
JWT_ACCESS_EXPIRES_IN=15m

APP_URL=${app_url}
API_URL=${api_url}

# Fill in for real Monime mobile-money billing (saas mode only — leave
# blank for dedicated instances, billed by contract instead):
MONIME_API_KEY=
MONIME_WEBHOOK_SECRET=
MONIME_ENV=production

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@ledgera.app

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./uploads
EOF
    chmod 600 "$API_ENV"
  else
    echo "$API_ENV already exists — leaving it untouched"

    # The one deliberate exception to "never rewritten": DATABASE_MIGRATOR_URL
    # is the one line nothing else depends on staying stable (it's used only
    # for running migrations, never by the running app), and it's exactly
    # the line most likely to have been written wrong by an earlier
    # interrupted run (the placeholder CHANGE_ME_MIGRATOR_PASSWORD, or a
    # password that predates setup_database()'s reconciliation above).
    # Keep it correct on every run instead of requiring a manual fix.
    if [[ "$owner_pass" != "CHANGE_ME_MIGRATOR_PASSWORD" ]]; then
      local correct_migrator_url="postgres://ledgera:${owner_pass}@localhost:5432/${DB_NAME}"
      if ! grep -qF "DATABASE_MIGRATOR_URL=${correct_migrator_url}" "$API_ENV"; then
        sed -i.bak "s|^DATABASE_MIGRATOR_URL=.*|DATABASE_MIGRATOR_URL=${correct_migrator_url}|" "$API_ENV"
        rm -f "${API_ENV}.bak"
        chmod 600 "$API_ENV"
        warn "DATABASE_MIGRATOR_URL in $API_ENV didn't match the current 'ledgera' role password — corrected it automatically."
      fi
    fi
  fi

  if [[ ! -f "$WEB_ENV" ]]; then
    log "Generating $WEB_ENV"
    cat > "$WEB_ENV" <<EOF
NEXT_PUBLIC_API_URL=${next_api_url}
NEXT_PUBLIC_APP_URL=${app_url}

# Read by ecosystem.config.js only (pm2 process port) — see INSTANCE_NAME
# note in apps/api/.env. Do not edit; not consumed by Next.js itself.
WEB_PORT=${WEB_PORT}
EOF
  else
    echo "$WEB_ENV already exists — leaving it untouched"
  fi
}

install_app_deps() {
  log "Installing dependencies (pnpm install --frozen-lockfile)"
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile)
}

# packages/db's scripts (migrate.ts, seed-default-users.ts) read
# DATABASE_URL/DATABASE_ADMIN_URL/DATABASE_MIGRATOR_URL straight from
# process.env, with no .env loading of their own — unlike the running app,
# which gets apps/api/.env injected by pm2 via ecosystem.config.js's own
# loadEnvFile() helper. Run directly via pnpm from this script, these
# one-off CLI invocations would otherwise see none of those variables set
# at all, and migrate.ts silently falls back to its own hardcoded
# local-dev default connection string — producing a confusing "password
# authentication failed" against a role/database that was never even the
# one actually being targeted.
#
# Parses KEY=VALUE lines and exports them directly (mirrors
# ecosystem.config.js's own loadEnvFile()) rather than `source`-ing the
# file as shell code — a value containing a space or other shell-special
# character (e.g. a manually-set SMTP_PASS) would otherwise be silently
# misparsed or, worse, executed.
load_env_file() {
  local file="$1" line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done < "$file"
}

run_migrations() {
  log "Running database migrations"
  (cd "$REPO_ROOT" && load_env_file "$API_ENV" && pnpm --filter @ledgera/db db:migrate)
}

seed_default_users() {
  log "Seeding a default user per role (only runs once, on a genuinely empty database)"
  (cd "$REPO_ROOT" && load_env_file "$API_ENV" && pnpm --filter @ledgera/db db:seed-default-users)
}

build_web() {
  log "Building web app"
  (cd "$REPO_ROOT" && pnpm --filter web build)
}

setup_pm2() {
  log "Starting/reloading processes via pm2 ($API_APP, $WEB_APP)"
  cd "$REPO_ROOT"
  if pm2 describe "$API_APP" >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js
  else
    pm2 start ecosystem.config.js
  fi
  pm2 save

  if ! pm2 startup 2>&1 | grep -q "already"; then
    warn "Run the 'sudo env PATH=...' command pm2 printed above once, so pm2 restarts LEDGERA automatically on server reboot."
  fi
  return 0
}

setup_caddy() {
  [[ -z "$DOMAIN" ]] && return 0
  log "Configuring Caddy for $DOMAIN / api.$DOMAIN"

  $SUDO mkdir -p /etc/caddy/conf.d
  if ! grep -q "conf.d" /etc/caddy/Caddyfile 2>/dev/null; then
    echo "import /etc/caddy/conf.d/*.caddy" | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
  fi

  $SUDO tee "/etc/caddy/conf.d/ledgera-${DB_NAME}.caddy" >/dev/null <<EOF
${DOMAIN} {
  reverse_proxy localhost:${WEB_PORT}
}

api.${DOMAIN} {
  reverse_proxy localhost:${API_PORT}
}
EOF

  $SUDO systemctl reload caddy || $SUDO systemctl restart caddy
  echo "Caddy will request HTTPS certs automatically once DNS for ${DOMAIN} and api.${DOMAIN} points at this server."
}

health_check() {
  log "Health check"
  sleep 2
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    echo "API: healthy"
  else
    warn "API health check failed — check: pm2 logs $API_APP"
  fi
  if curl -fsS "http://localhost:${WEB_PORT}" >/dev/null 2>&1; then
    echo "Web: reachable"
  else
    warn "Web app not reachable on :${WEB_PORT} — check: pm2 logs $WEB_APP"
  fi
  # Public storefront (/v1/public/*) only serves in dedicated mode — see
  # apps/api/src/modules/public/public.routes.ts.
  if [[ "$MODE" == "dedicated" ]]; then
    if curl -fsS "http://localhost:${API_PORT}/v1/public/org" >/dev/null 2>&1; then
      echo "Public storefront: reachable"
    else
      warn "Public storefront (/v1/public/org) not reachable — check: pm2 logs $API_APP"
    fi
  fi
  return 0
}

# ── Final summary — what actually got deployed and what to do next ───────
print_summary() {
  local web_url api_url
  if [[ -n "$DOMAIN" ]]; then
    web_url="https://${DOMAIN}"
    api_url="https://api.${DOMAIN}"
  else
    web_url="http://<server-ip>:${WEB_PORT}"
    api_url="http://<server-ip>:${API_PORT}"
  fi

  log "Done."
  echo "  Mode:      $MODE"
  echo "  Web app:   $web_url"
  echo "  API:       $api_url"
  [[ "$MODE" == "dedicated" ]] && echo "  Storefront: ${web_url}/  ·  Catalog: ${web_url}/catalog"
  echo "  Staff login: ${web_url}/login"
  echo

  if [[ -z "$DOMAIN" ]]; then
    warn "No --domain given — reachable only at the plain http:// address above. Put a reverse proxy or DNS + --domain in front for real production traffic."
  fi

  if [[ -f "$REPO_ROOT/.ledgera-default-users.txt" ]]; then
    echo "  Default login credentials (one per role) were written to:"
    echo "    $REPO_ROOT/.ledgera-default-users.txt"
    echo "  Save these to your password manager, then delete the file."
  fi

  if [[ "$MODE" == "dedicated" ]]; then
    echo
    echo "  Before sharing the storefront link with real customers:"
    echo "   1. Sign in and set your real business name/address/phone under Settings"
    echo "      → Organisation (the public site and catalog pull from there — it"
    echo "      currently shows the placeholder starter-org details)."
    echo "   2. Add your products (with prices) under Inventory so the catalog isn't empty."
  fi
  return 0
}

main() {
  resolve_existing_env
  API_APP="ledgera-api-${INSTANCE}"
  WEB_APP="ledgera-web-${INSTANCE}"
  check_ports_free
  check_dns
  echo "Deploying LEDGERA — mode=$MODE db=$DB_NAME instance=$INSTANCE domain=${DOMAIN:-none} api=:$API_PORT web=:$WEB_PORT"
  install_system_deps
  setup_database
  setup_env
  install_app_deps
  run_migrations
  seed_default_users
  build_web
  setup_pm2
  setup_caddy
  health_check
  print_summary
}

main
