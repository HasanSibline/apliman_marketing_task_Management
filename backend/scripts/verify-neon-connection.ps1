# 🔧 Neon Database Setup Verification Script (PowerShell)
# This script helps verify your Neon connection is configured correctly

Write-Host "🔍 Neon Database Connection Verifier" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
$DATABASE_URL = $env:DATABASE_URL
if (-not $DATABASE_URL) {
    Write-Host "⚠️  DATABASE_URL not set in environment" -ForegroundColor Yellow
    $DATABASE_URL = Read-Host "Please provide your Neon connection string"
}

$maskedUrl = $DATABASE_URL.Substring(0, [Math]::Min(30, $DATABASE_URL.Length)) + "...***"
Write-Host "📝 Connection string: $maskedUrl" -ForegroundColor Gray
Write-Host ""

# Verify it's a Neon URL
if ($DATABASE_URL -like "*neon.tech*" -or $DATABASE_URL -like "*neon.aws*") {
    Write-Host "✅ Valid Neon connection string detected" -ForegroundColor Green
} else {
    Write-Host "⚠️  WARNING: This doesn't look like a Neon URL" -ForegroundColor Yellow
    Write-Host "   Expected to contain 'neon.tech' or 'neon.aws'" -ForegroundColor Yellow
}

# Check for pooled connection (recommended)
if ($DATABASE_URL -like "*-pooler*" -or $DATABASE_URL -like "*pooler=true*") {
    Write-Host "✅ Using pooled connection (recommended)" -ForegroundColor Green
} else {
    Write-Host "⚠️  NOTICE: Not using pooled connection" -ForegroundColor Yellow
    Write-Host "   For better performance, use 'Pooled connection' from Neon dashboard" -ForegroundColor Yellow
}

# Check for SSL mode
if ($DATABASE_URL -like "*sslmode=require*") {
    Write-Host "✅ SSL mode enabled" -ForegroundColor Green
} else {
    Write-Host "⚠️  WARNING: sslmode=require not found" -ForegroundColor Yellow
    Write-Host "   Add '?sslmode=require' to the end of your connection string" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🧪 Testing connection..." -ForegroundColor Cyan

# Test connection with psql if available
$psql = Get-Command psql -ErrorAction SilentlyContinue

if ($psql) {
    try {
        $versionOutput = & psql $DATABASE_URL -c "SELECT version();" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Connection successful!" -ForegroundColor Green
            
            # Get PostgreSQL version
            $pgVersion = & psql $DATABASE_URL -t -c "SELECT version();" 2>$null | Select-Object -First 1
            Write-Host "📊 PostgreSQL version: $($pgVersion.Trim())" -ForegroundColor Cyan
            
            # Count tables
            $tableCount = & psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null
            $tableCount = $tableCount.Trim()
            Write-Host "📁 Tables in database: $tableCount" -ForegroundColor Cyan
            
            if ($tableCount -eq "0") {
                Write-Host ""
                Write-Host "ℹ️  Database is empty - migrations will run on first backend deploy" -ForegroundColor Blue
            } else {
                Write-Host ""
                Write-Host "✅ Database is ready and populated!" -ForegroundColor Green
            }
        } else {
            Write-Host "❌ Connection failed!" -ForegroundColor Red
            Write-Host ""
            Write-Host "Possible issues:" -ForegroundColor Yellow
            Write-Host "1. Wrong connection string"
            Write-Host "2. Database not created"
            Write-Host "3. Network/firewall issue"
            Write-Host ""
            Write-Host "Check your Neon dashboard: https://console.neon.tech" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "❌ Connection test failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  psql not installed - skipping connection test" -ForegroundColor Yellow
    Write-Host "   Install PostgreSQL client to test connection" -ForegroundColor Yellow
    Write-Host "   Download: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Update DATABASE_URL on Render backend"
Write-Host "2. Deploy backend (it will auto-migrate)"
Write-Host "3. Test your application"
Write-Host ""
Write-Host "Full guide: NEON_MIGRATION_GUIDE.md" -ForegroundColor Cyan

