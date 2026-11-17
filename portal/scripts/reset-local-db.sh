#!/usr/bin/env bash
# Rebuilds the LOCAL test database: Supabase stand-in + migrations + fictional test data.
# Never run against a real Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop database if exists portal_test" -c "create database portal_test"
$PSQL -d portal_test -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do $PSQL -d portal_test -f "$f"; done
$PSQL -d portal_test -f supabase/tests/10_test_data.sql
echo "local database portal_test ready"
