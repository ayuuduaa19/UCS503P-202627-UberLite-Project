#!/bin/sh
set -e

echo "=== UberLite Backend Container Initializing ==="

# Run Prisma schema push if enabled
if [ "$RUN_MIGRATIONS" = "true" ] || [ "$RUN_MIGRATIONS" = "1" ]; then
  echo "Applying Prisma database schema..."
  npx prisma db push --skip-generate || echo "Database push warning: schema may already be in sync"
fi

# Seed demo data if enabled
if [ "$RUN_SEED" = "true" ] || [ "$RUN_SEED" = "1" ]; then
  echo "Seeding demo database records..."
  npm run prisma:seed || echo "Seed notice: initial demo data may already exist"
fi

echo "=== Starting UberLite Backend Server ==="
exec "$@"
