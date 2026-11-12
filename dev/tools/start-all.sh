#!/usr/bin/env bash
# Starts everything needed for local end-to-end work: Docker stack, API functions and Vite.
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! docker ps >/dev/null 2>&1; then rm -f /var/run/docker/containerd/containerd.pid /var/run/docker.pid; (setsid nohup dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 1 30); do docker ps >/dev/null 2>&1 && break; sleep 1; done; fi
bash dev/stack/up.sh
. dev/stack/.env.stack
cat > .env.local <<ENV
VITE_SUPABASE_URL=local
VITE_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SITE_URL=http://127.0.0.1:5173
IP_HASH_SALT=local-dev-salt
ENV
pkill -f "scripts/dev-api.ts" 2>/dev/null || true
pkill -f "node_modules/.bin/vite" 2>/dev/null || true
(setsid nohup npx tsx scripts/dev-api.ts > /tmp/api.log 2>&1 &)
(LOCAL_SUPABASE_GATEWAY=http://127.0.0.1:54321 setsid nohup npx vite > /tmp/vite.log 2>&1 &)
for i in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
echo "app → http://127.0.0.1:5173   api → http://127.0.0.1:8788"
