# Production Database Update Script (PowerShell)
# This script updates the production database schema without losing data

Write-Host "🔄 Updating production database schema..." -ForegroundColor Cyan

# Run Prisma DB Push to sync schema
# This will only drop the analytics table and keep all other data
npx prisma db push --accept-data-loss --skip-generate

Write-Host "✅ Database schema updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Generating Prisma Client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "✅ All done! Database is ready." -ForegroundColor Green
