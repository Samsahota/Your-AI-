#!/usr/bin/env bash
# Rebuilds the local test database: Supabase stub + migrations + demo seed. LOCAL TESTING ONLY.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop database if exists thp" -c "create database thp"
$PSQL -d thp -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do $PSQL -d thp -f "$f"; done
node scripts/gen-seed.mjs >/dev/null
$PSQL -d thp -c "insert into auth.users (id, email) select (v->>'id')::uuid, v->>'email' from jsonb_each('$(node -e "console.log(JSON.stringify(require('./supabase/seed/demo_users.json').users))")'::jsonb) as e(k, v)"
$PSQL -d thp -f supabase/seed/demo_tenant.sql
echo "local database ready"
