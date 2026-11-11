#!/usr/bin/env bash
pkill -f "dev/stack/gateway.mjs" 2>/dev/null || true
docker rm -f devmart-db devmart-auth devmart-rest devmart-storage >/dev/null 2>&1 || true
docker network rm devmart-net >/dev/null 2>&1 || true
echo "local stack stopped"
