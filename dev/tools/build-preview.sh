#!/usr/bin/env bash
# Builds the backend-less storefront preview as ONE html fragment: dist-preview/devmart-preview.html
set -euo pipefail
cd "$(dirname "$0")/../.."
npx vite build -c vite.preview.config.ts >/dev/null
python3 - <<'PY'
js = open('dist-preview/app.js').read().replace('</script', '<\\/script')
css = open('dist-preview/app.css').read().replace('</style', '<\\/style')
open('dist-preview/devmart-preview.html', 'w').write('<title>DevMart</title>\n<style>' + css + '</style>\n<div id="root"></div>\n<script>' + js + '</script>\n')
PY
echo "dist-preview/devmart-preview.html"
