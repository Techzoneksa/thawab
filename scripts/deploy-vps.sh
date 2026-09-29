#!/bin/bash
# Server-side deploy for the multi-tenant VPS. Called by /root/deploy-thawab.sh
# (the restricted-key forced command) AFTER it has reset the checkout to
# origin/<branch>, so this logic is versioned in git.
#
# Order: deps → build → migrate EVERY tenant (controlled, finance gate) → restart.
# If any tenant migration fails, abort BEFORE restarting: the running process
# keeps serving the previous version.
set -euo pipefail
cd "$(dirname "$0")/.."

H=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$H" != "$(cat /root/.thawab-lockhash 2>/dev/null || true)" ]; then
  npm ci --no-audit --no-fund
  echo "$H" > /root/.thawab-lockhash
fi

npm run build
node_modules/.bin/tsx scripts/migrate-tenants.ts

# Re-read the ecosystem file so env (incl. the tenant registry) is current.
pm2 restart ecosystem.config.cjs --update-env
pm2 save > /dev/null
echo "DEPLOYED $(git rev-parse --short HEAD)"
