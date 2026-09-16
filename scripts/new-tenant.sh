#!/bin/bash
# ============================================================================
# new-tenant.sh — provision a new Thawab tenant (SaaS)
# ----------------------------------------------------------------------------
# Creates a ready, EMPTY tenant instance:
#   1. applies the full schema to the tenant's (Neon) database
#   2. prints the registry line to add to the app's TENANTS_JSON env
#
# The tenant's owner then opens https://<slug>.<BASE_DOMAIN> and the first-run
# wizard lets THEM create their admin account and password. No data is seeded.
#
# Usage:
#   bash scripts/new-tenant.sh <slug> "<neon-database-url>"
# Example:
#   bash scripts/new-tenant.sh abufadi "postgresql://user:pass@ep-xxx.neon.tech/abufadi?sslmode=require"
# ============================================================================
set -euo pipefail

SLUG="${1:-}"
URL="${2:-}"

if [ -z "$SLUG" ] || [ -z "$URL" ]; then
  echo "Usage: bash scripts/new-tenant.sh <slug> \"<neon-database-url>\""
  exit 1
fi

if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "[new-tenant] slug must be lowercase letters, digits and hyphens (a valid subdomain)."
  exit 1
fi

echo "[new-tenant] applying schema to tenant '$SLUG'..."
DATABASE_URL="$URL" npm run db:migrate

echo ""
echo "============================================================"
echo "  Tenant '$SLUG' schema is ready (empty)."
echo "============================================================"
echo ""
echo "1) Add this entry to the app's TENANTS_JSON env (then restart the app):"
echo ""
echo "   \"$SLUG\": { \"databaseUrl\": \"$URL\" }"
echo ""
echo "2) Point DNS  $SLUG.<BASE_DOMAIN>  at the server (a wildcard *.<BASE_DOMAIN>"
echo "   record covers every tenant automatically)."
echo ""
echo "3) Send the owner:  https://$SLUG.<BASE_DOMAIN>"
echo "   They open it and the first-run wizard creates their admin + password."
echo ""
