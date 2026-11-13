#!/usr/bin/env bash
# Local Supabase-compatible stack for development and tests:
#   Postgres 15 (supabase image) + GoTrue (auth) + PostgREST + Storage API + a tiny gateway.
# Requires Docker and Node. Usage: npm run stack:up
set -euo pipefail
cd "$(dirname "$0")"

REG="${STACK_REGISTRY:-mirror.gcr.io}"
NET=devmart-net
PGPASS=postgres
DBPORT=54322
ENV_FILE=.env.stack

if [ ! -f "$ENV_FILE" ]; then
  node gen-keys.mjs > "$ENV_FILE"
fi
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

docker network inspect $NET >/dev/null 2>&1 || docker network create $NET >/dev/null
run() { name=$1; shift; docker rm -f "$name" >/dev/null 2>&1 || true; docker run -d --name "$name" --network $NET "$@" >/dev/null; }

run devmart-db -p 127.0.0.1:$DBPORT:5432 -e POSTGRES_PASSWORD=$PGPASS -e JWT_SECRET="$JWT_SECRET" \
  $REG/supabase/postgres:15.8.1.060

export PGPASSWORD=$PGPASS
PSQL="psql -h 127.0.0.1 -p $DBPORT -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
echo "waiting for postgres…"
for i in $(seq 1 90); do $PSQL -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
sleep 3
for i in $(seq 1 30); do $PSQL -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done

$PSQL <<SQL
alter user authenticator with password '$PGPASS';
alter user supabase_auth_admin with password '$PGPASS';
alter user supabase_storage_admin with password '$PGPASS';
alter user postgres with password '$PGPASS';
SQL

run devmart-auth -p 127.0.0.1:54331:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$PGPASS@devmart-db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://127.0.0.1:5173 -e GOTRUE_DISABLE_SIGNUP=true \
  -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  -e GOTRUE_MFA_TOTP_ENROLL_ENABLED=true -e GOTRUE_MFA_TOTP_VERIFY_ENABLED=true \
  -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  $REG/supabase/gotrue:v2.170.0

run devmart-rest -p 127.0.0.1:54332:3000 \
  -e PGRST_DB_URI="postgres://authenticator:$PGPASS@devmart-db:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public,storage -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_DB_USE_LEGACY_GUCS=false \
  $REG/postgrest/postgrest:v12.2.3

run devmart-storage -p 127.0.0.1:54333:5000 \
  -e ANON_KEY="$ANON_KEY" -e SERVICE_KEY="$SERVICE_ROLE_KEY" -e POSTGREST_URL=http://devmart-rest:3000 \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_URL="postgres://supabase_storage_admin:$PGPASS@devmart-db:5432/postgres" \
  -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
  -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false \
  $REG/supabase/storage-api:v1.19.3

echo "waiting for auth + storage migrations…"
for i in $(seq 1 60); do
  a=$($PSQL -Atc "select to_regclass('auth.mfa_factors') is not null and to_regclass('storage.objects') is not null and exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types')" 2>/dev/null || echo f)
  [ "$a" = "t" ] && break; sleep 1
done

echo "applying DevMart migrations…"
PSQL_PG="psql -h 127.0.0.1 -p $DBPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
if [ -n "${SETUP_FILE:-}" ]; then
  echo "  $(basename "$SETUP_FILE") (single file)"; $PSQL_PG -f "$SETUP_FILE" >/dev/null
else
  for f in ../../supabase/migrations/*.sql; do echo "  $(basename "$f")"; $PSQL_PG -f "$f" >/dev/null; done
fi
$PSQL -c "notify pgrst, 'reload schema'" >/dev/null

pkill -f "dev/stack/gateway.mjs" 2>/dev/null || true
(setsid nohup node "$(pwd)/gateway.mjs" > gateway.log 2>&1 &)
sleep 1
echo "local stack ready → http://127.0.0.1:54321  (keys in dev/stack/$ENV_FILE)"
