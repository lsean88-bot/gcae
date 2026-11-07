#!/usr/bin/env bash
# Meridian laptop setup (Linux, WSL, macOS). Safe to run again.
# Needs: Node 22 or newer, PostgreSQL (psql) and a PostgreSQL admin password, asked at run time.
# The admin password is never written to disk. It is used once to create a dedicated database user.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
cd "$APP"

step() { printf '\n== %s\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*" >&2; exit 1; }

step "1. Checking Node and PostgreSQL"
command -v node >/dev/null 2>&1 || die "Node is not installed. Install Node 22 LTS:
  macOS:         brew install node@22        (then: brew link --overwrite node@22)
  Ubuntu/WSL:    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
  Any system:    download the Node 22 LTS installer from https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node $(node -v) is too old. Meridian needs Node 22 or newer. Install it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || die "npm was not found. It normally comes with Node. Reinstall Node 22 LTS from https://nodejs.org"
echo "Node $(node -v) ok"

if ! command -v psql >/dev/null 2>&1; then
  for d in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /Applications/Postgres.app/Contents/Versions/latest/bin /usr/lib/postgresql/*/bin; do
    if [ -x "$d/psql" ]; then PATH="$d:$PATH"; export PATH; break; fi
  done
fi
command -v psql >/dev/null 2>&1 || die "PostgreSQL (psql) was not found. Install PostgreSQL 16 or newer:
  macOS:         brew install postgresql@16 && brew services start postgresql@16
  Ubuntu/WSL:    sudo apt-get install -y postgresql postgresql-client && sudo service postgresql start
  Any system:    download the installer from https://www.postgresql.org/download/
Then open a new terminal and run this script again."
echo "$(psql --version) ok"

step "2. Database and settings file"
if [ -f .env ]; then
  echo ".env already exists. Keeping it unchanged. Database creation is skipped."
else
  PGHOST_USE="${PGHOST:-127.0.0.1}"
  PGPORT_USE="${PGPORT:-5432}"
  read -r -p "PostgreSQL admin user [postgres]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-postgres}"
  read -r -s -p "Password for PostgreSQL user '$ADMIN_USER' (typed here, never saved): " ADMIN_PW
  echo
  export PGPASSWORD="$ADMIN_PW"
  unset ADMIN_PW
  adminsql() { psql -h "$PGHOST_USE" -p "$PGPORT_USE" -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -X -q "$@"; }
  adminsql -tAc "select 1" >/dev/null 2>&1 || die "Could not connect to PostgreSQL at $PGHOST_USE:$PGPORT_USE as '$ADMIN_USER'. Check that PostgreSQL is running and the password is right."
  APP_DB_PW="$(node -p "require('crypto').randomBytes(24).toString('hex')")"
  APP_SECRET_VAL="$(node -p "require('crypto').randomBytes(48).toString('base64url')")"
  if [ "$(adminsql -tAc "select count(*) from pg_roles where rolname='meridian_app'")" = "0" ]; then
    adminsql -c "create role meridian_app login password '$APP_DB_PW'"
  else
    adminsql -c "alter role meridian_app login password '$APP_DB_PW'"
  fi
  if [ "$(adminsql -tAc "select count(*) from pg_database where datname='meridian'")" = "0" ]; then
    adminsql -c "create database meridian owner meridian_app"
  else
    adminsql -c "alter database meridian owner to meridian_app"
    echo "Database 'meridian' already exists. Kept, ownership given to meridian_app."
  fi
  unset PGPASSWORD
  umask 077
  {
    echo "# Written by laptop/setup.sh. Local to this laptop. Never commit or share this file."
    echo "DATABASE_URL=postgresql://meridian_app:${APP_DB_PW}@${PGHOST_USE}:${PGPORT_USE}/meridian"
    echo "APP_SECRET=${APP_SECRET_VAL}"
  } > .env
  unset APP_DB_PW APP_SECRET_VAL
  echo "Created .env (database user meridian_app with a random password, random APP_SECRET)."
fi

step "3. Checking .env"
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2-)"
SECRET_LEN="$(grep -E '^APP_SECRET=' .env | head -n1 | cut -d= -f2- | tr -d '\r\n' | wc -c | tr -d ' ')"
[ -n "$DB_URL" ] || die ".env has no DATABASE_URL line. Fix it or delete .env and run this script again."
[ "$SECRET_LEN" -ge 32 ] || die ".env APP_SECRET is missing or shorter than 32 characters. Fix it (see .env.example)."
psql -X -q -tA -d "$DB_URL" -c "select 1" >/dev/null 2>&1 || die "Cannot connect to the database named in .env. Check that PostgreSQL is running. If you changed the database password, delete .env and run this script again."
echo ".env ok, database reachable"

step "4. Installing the app (npm ci)"
npm ci
step "5. Creating tables (db:push)"
npm run db:push
step "6. Hardening the audit log (db:harden)"
npm run db:harden
step "7. Building the app"
npm run build

step "8. One-time password for the GCAE (p-gcae)"
HAS_PW="$(psql -X -q -tA -d "$DB_URL" -c "select count(*) from people where id='p-gcae' and password_hash is not null" 2>/dev/null || echo 0)"
if [ "${HAS_PW:-0}" != "0" ]; then
  echo "p-gcae already has a password. Not issuing another. To reset it: npm run setup:passwords -- p-gcae"
else
  echo "Write the password below down now. It is shown once. Only p-gcae gets one. Nobody else can sign in."
  npm run --silent setup:passwords -- p-gcae
fi

step "9. Building the Claude connector (mcp)"
( cd mcp && npm ci && npm run build )

cat <<MSG

Setup finished.
Next:
  1. Start Meridian:  ./laptop/start.sh
  2. Open http://127.0.0.1:3000 , sign in as the GCAE with the one-time password, and choose a new password.
  3. Create your Claude token:  npm run token:create -- --person p-gcae --name laptop --days 90
  See docs/LAPTOP-QUICKSTART.md
MSG
