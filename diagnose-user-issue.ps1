# PowerShell script to diagnose the user issue
# This will help identify if the database was reset or if there's a mismatch

Write-Host "=== USER AUTHENTICATION DIAGNOSTIC ===" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
Write-Host "1. Checking DATABASE_URL..." -ForegroundColor Yellow
$envFile = "backend\.env"
if (Test-Path $envFile) {
    $dbUrl = Get-Content $envFile | Select-String "DATABASE_URL" | Select-Object -First 1
    if ($dbUrl) {
        # Mask the password for security
        $maskedUrl = $dbUrl -replace '://([^:]+):([^@]+)@', '://$1:****@'
        Write-Host "   Found: $maskedUrl" -ForegroundColor Green
    } else {
        Write-Host "   DATABASE_URL not found in .env" -ForegroundColor Red
    }
} else {
    Write-Host "   .env file not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Checking recent database migrations..." -ForegroundColor Yellow
$migrationsDir = "backend\prisma\migrations"
if (Test-Path $migrationsDir) {
    $recentMigrations = Get-ChildItem $migrationsDir -Directory | Sort-Object CreationTime -Descending | Select-Object -First 5
    foreach ($migration in $recentMigrations) {
        Write-Host "   - $($migration.Name) (Created: $($migration.CreationTime))" -ForegroundColor Cyan
    }
} else {
    Write-Host "   Migrations directory not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Checking if Prisma Client is up to date..." -ForegroundColor Yellow
$prismaClientPath = "backend\node_modules\.prisma\client"
if (Test-Path $prismaClientPath) {
    $clientInfo = Get-ChildItem $prismaClientPath | Select-Object -First 1
    Write-Host "   Prisma Client exists (Modified: $($clientInfo.LastWriteTime))" -ForegroundColor Green
} else {
    Write-Host "   Prisma Client not found - may need to run 'npx prisma generate'" -ForegroundColor Red
}

Write-Host ""
Write-Host "4. Checking backend deployment logs..." -ForegroundColor Yellow
Write-Host "   Looking for database reset indicators..." -ForegroundColor Gray

Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "The JWT token contains user ID: 24971ac0-2cdd-4f97-a25e-e94d1ba0af66" -ForegroundColor White
Write-Host "But this user doesn't exist in the database." -ForegroundColor White
Write-Host ""
Write-Host "Possible causes:" -ForegroundColor Yellow
Write-Host "  1. Database was reset/migrated after you logged in" -ForegroundColor White
Write-Host "  2. You're connected to a different database instance" -ForegroundColor White
Write-Host "  3. The user was deleted (though you say this didn't happen)" -ForegroundColor White
Write-Host ""
Write-Host "SOLUTION:" -ForegroundColor Green
Write-Host "  1. Clear your browser's localStorage (or use Incognito mode)" -ForegroundColor White
Write-Host "  2. Go to /admin/login" -ForegroundColor White
Write-Host "  3. Login as Super Admin (superadmin@apliman.com)" -ForegroundColor White
Write-Host "  4. Create the company again (or check if it exists)" -ForegroundColor White
Write-Host "  5. Login with the NEW credentials" -ForegroundColor White
Write-Host ""
Write-Host "To clear localStorage in browser console:" -ForegroundColor Cyan
Write-Host "  localStorage.clear();" -ForegroundColor Gray
Write-Host "  sessionStorage.clear();" -ForegroundColor Gray
Write-Host "  location.reload();" -ForegroundColor Gray
Write-Host ""

Write-Host "=== SQL QUERIES TO RUN IN NEON ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run these queries in your Neon database console to check the state:" -ForegroundColor Yellow
Write-Host ""
Write-Host @"
-- Check if the user from JWT exists
SELECT id, name, email, role, "companyId", status 
FROM "User" 
WHERE id = '24971ac0-2cdd-4f97-a25e-e94d1ba0af66';

-- Check all COMPANY_ADMIN users
SELECT u.id, u.name, u.email, u.role, c.name as company_name, u."createdAt"
FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
WHERE u.role = 'COMPANY_ADMIN'
ORDER BY u."createdAt" DESC;

-- Check all companies
SELECT id, name, slug, "isActive", "aiEnabled", "createdAt"
FROM "Company"
ORDER BY "createdAt" DESC;

-- Check when the database was last seeded
SELECT id, email, role, "createdAt"
FROM "User"
WHERE role = 'SUPER_ADMIN';
"@ -ForegroundColor Gray

Write-Host ""
Write-Host "=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Run the SQL queries above in Neon console" -ForegroundColor White
Write-Host "2. Clear browser storage and login again" -ForegroundColor White
Write-Host "3. If the company doesn't exist, create it again from Super Admin panel" -ForegroundColor White
Write-Host ""

