#!/bin/bash
# Register a tenant (subdomain → database) on this VPS, migrate it through the
# controlled runner, and reload the app.
#
#   bash scripts/tenant-add.sh <slug>
#
# The database URL is read at a hidden prompt (never on the command line, so it
# is not stored in shell history). Works for an existing database (e.g. moving an
# association here) and for a brand-new empty one.
set -euo pipefail
cd "$(dirname "$0")/.."

SLUG="${1:-}"
if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "usage: bash scripts/tenant-add.sh <subdomain-slug>   (e.g. thawab, radifa)"
  exit 1
fi
FILE="${THAWAB_TENANTS_FILE:-/root/thawab-tenants.json}"

read -rsp "Database URL for '$SLUG' (input hidden — paste, then Enter): " URL
echo
# Tolerate what copy/paste usually adds: surrounding spaces, CR, quotes, a
# leading "DATABASE_URL=".
URL="$(printf '%s' "$URL" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^DATABASE_URL=//' -e "s/^[\"']//" -e "s/[\"']\$//")"
if ! [[ "$URL" == postgres://* || "$URL" == postgresql://* ]]; then
  echo "[tenant-add] that is not a postgres:// URL (got ${#URL} chars starting '${URL:0:12}…') — nothing changed"
  exit 1
fi
# Show WHERE it points (host:port/db, never the password) so you can confirm.
echo "[tenant-add] database: $(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^@]*@##; s#\?.*$##')"

[ -s "$FILE" ] || echo '{}' > "$FILE"
SLUG="$SLUG" URL="$URL" FILE="$FILE" node -e '
  const fs = require("fs");
  const f = process.env.FILE;
  const reg = JSON.parse(fs.readFileSync(f, "utf8") || "{}");
  reg[process.env.SLUG] = { databaseUrl: process.env.URL };
  fs.writeFileSync(f, JSON.stringify(reg));
'
chmod 600 "$FILE"

echo "[tenant-add] migrating '$SLUG' (controlled runner)…"
TENANTS_JSON="$(SLUG="$SLUG" FILE="$FILE" node -e '
  const reg = JSON.parse(require("fs").readFileSync(process.env.FILE, "utf8"));
  process.stdout.write(JSON.stringify({ [process.env.SLUG]: reg[process.env.SLUG] }));
')" node_modules/.bin/tsx scripts/migrate-tenants.ts

pm2 restart ecosystem.config.cjs --update-env
pm2 save > /dev/null
echo "[tenant-add] '$SLUG' registered. Check: curl -s -H \"Host: $SLUG.jaadpro.com\" http://127.0.0.1:3000/api/auth-bootstrap"
