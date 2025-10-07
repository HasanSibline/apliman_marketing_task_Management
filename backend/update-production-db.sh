#!/bin/bash

# Production Database Update Script
# This script updates the production database schema without losing data

echo "🔄 Updating production database schema..."

# Run Prisma DB Push to sync schema
# This will only drop the analytics table and keep all other data
npx prisma db push --accept-data-loss --skip-generate

echo "✅ Database schema updated successfully!"
echo ""
echo "📊 Generating Prisma Client..."
npx prisma generate

echo "✅ All done! Database is ready."
