#!/usr/bin/env bash
# Runs the SQL security tests against the local stack database (npm run stack:up).
set -euo pipefail
cd "$(dirname "$0")"
export PGPASSWORD="${PGPASSWORD:-postgres}"
psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -q -f security.sql 2>&1 | grep -vE '^(BEGIN|ROLLBACK|GRANT|SET|RESET|CREATE|INSERT|SELECT)' | sed 's/^psql:[^ ]* NOTICE:  //'
