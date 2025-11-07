# 🗄️ Export Database from Render (PowerShell)
# This script exports your current database to a SQL dump file

Write-Host "📦 Starting database export..." -ForegroundColor Cyan

# Check if DATABASE_URL is set
$DATABASE_URL = $env:DATABASE_URL
if (-not $DATABASE_URL) {
    Write-Host "❌ ERROR: DATABASE_URL environment variable not set" -ForegroundColor Red
    $DATABASE_URL = Read-Host "Please provide your Render database URL"
}

# Export filename with timestamp
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$EXPORT_FILE = "database_backup_$TIMESTAMP.sql"

Write-Host "🔄 Exporting database to: $EXPORT_FILE" -ForegroundColor Yellow

# Check if pg_dump is available
$pg_dump = Get-Command pg_dump -ErrorAction SilentlyContinue

if ($pg_dump) {
    # Run pg_dump
    & pg_dump $DATABASE_URL | Out-File -FilePath $EXPORT_FILE -Encoding UTF8
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $EXPORT_FILE).Length / 1MB
        Write-Host "✅ Export successful!" -ForegroundColor Green
        Write-Host "📄 File saved: $EXPORT_FILE" -ForegroundColor Green
        Write-Host "📊 File size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Create your Neon database"
        Write-Host "2. Run: psql <NEON_DATABASE_URL> -f $EXPORT_FILE"
    } else {
        Write-Host "❌ Export failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ ERROR: pg_dump not found" -ForegroundColor Red
    Write-Host "Please install PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "Download from: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

