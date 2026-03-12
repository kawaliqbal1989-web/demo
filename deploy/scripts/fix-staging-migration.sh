#!/bin/bash
# Fix for staging migration failure:
# Migration 20260216010000_security_enforcement was folded into the init migration
# but staging DB still has a failed record for it.
#
# Run this from the project root with STAGING environment:
#
#   DATABASE_URL="mysql://user:pass@127.0.0.1:3307/abacusweb_staging" bash scripts/fix-staging-migration.sh

set -e

echo "=== Step 1: Mark failed migration as rolled back ==="
npx prisma migrate resolve --rolled-back 20260216010000_security_enforcement

echo ""
echo "=== Step 2: Re-run migrate deploy ==="
npx prisma migrate deploy

echo ""
echo "=== Done. Staging migrations should now be up to date. ==="
