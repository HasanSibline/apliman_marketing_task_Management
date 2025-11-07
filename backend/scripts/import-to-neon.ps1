# 📥 Import Database to Neon (PowerShell)
# This script imports your SQL dump into Neon database

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

Write-Host "📥 Starting database import to Neon..." -ForegroundColor Cyan

# Check if file exists
if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ ERROR: File not found: $BackupFile" -ForegroundColor Red
    exit 1
}

# Check if NEON_DATABASE_URL is set
$NEON_DATABASE_URL = $env:NEON_DATABASE_URL
if (-not $NEON_DATABASE_URL) {
    $NEON_DATABASE_URL = Read-Host "Please provide your Neon database URL (Pooled connection)"
}

Write-Host "🔄 Importing from: $BackupFile" -ForegroundColor Yellow
Write-Host "🎯 Target: Neon database" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  WARNING: This will add data to your Neon database" -ForegroundColor Red
$confirm = Read-Host "Continue? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Import cancelled" -ForegroundColor Red
    exit 0
}

# Check if psql is available
$psql = Get-Command psql -ErrorAction SilentlyContinue

if ($psql) {
    # Run psql import
    Get-Content $BackupFile | & psql $NEON_DATABASE_URL
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Import successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Update DATABASE_URL on Render backend to use Neon"
        Write-Host "2. Redeploy your backend"
        Write-Host "3. Test your application"
    } else {
        Write-Host "❌ Import failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ ERROR: psql not found" -ForegroundColor Red
    Write-Host "Please install PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "Download from: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

