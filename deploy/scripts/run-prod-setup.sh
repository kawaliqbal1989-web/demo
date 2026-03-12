#!/usr/bin/env bash
set -euo pipefail

# run-prod-setup.sh
# Usage: bash scripts/run-prod-setup.sh
# This script performs the common production setup steps from the app root.

ROOT_DIR="$(pwd)"

echo "Running production setup from: $ROOT_DIR"

# Ensure .env exists
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo "Creating .env from .env.production (please edit .env first to set secrets if needed)"
    cp .env.production .env
  else
    echo "ERROR: .env and .env.production not found. Create .env and re-run."
    exit 1
  fi
fi

# Ensure uploads dir
mkdir -p uploads
chmod 775 uploads || true

# Install production dependencies
echo "Installing production dependencies..."
npm ci --omit=dev

# Prisma generate
echo "Generating Prisma client..."
npx prisma generate

# Apply migrations (try migrate deploy, fallback to db push)
echo "Applying database migrations (migrate deploy)..."
if npx prisma migrate deploy; then
  echo "Migrations applied."
else
  echo "migrate deploy failed; attempting prisma db push (schema sync)."
  npx prisma db push --schema prisma/schema.prisma
  npx prisma generate
fi

# Optional: seed DB (uncomment if running first-time)
# echo "Seeding database (first-time only)..."
# npx prisma db seed

echo "Done. Start or restart the Node app in cPanel (startup file: src/server.js)."

echo "Health check endpoints: /health and /health/db"

exit 0
