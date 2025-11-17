# PowerShell script to verify user has companyId in database
# This checks if the logged-in user has a companyId

$BACKEND_URL = "https://taskmanagement-backendv2.onrender.com"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "USER COMPANYID VERIFICATION" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Get token from user
Write-Host "Please paste your current JWT token (from browser localStorage):" -ForegroundColor Yellow
$token = Read-Host

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "❌ No token provided" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Checking user profile..." -ForegroundColor Cyan

try {
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$BACKEND_URL/api/users/me" -Method Get -Headers $headers -ErrorAction Stop
    
    Write-Host ""
    Write-Host "✅ User Profile Retrieved:" -ForegroundColor Green
    Write-Host "  ID: $($response.id)" -ForegroundColor White
    Write-Host "  Name: $($response.name)" -ForegroundColor White
    Write-Host "  Email: $($response.email)" -ForegroundColor White
    Write-Host "  Role: $($response.role)" -ForegroundColor White
    
    if ($response.companyId) {
        Write-Host "  CompanyId: $($response.companyId)" -ForegroundColor Green
        Write-Host ""
        Write-Host "✅ USER HAS COMPANYID - This is correct!" -ForegroundColor Green
        
        # Try to get company details
        Write-Host ""
        Write-Host "Fetching company details..." -ForegroundColor Cyan
        
        try {
            $companyResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/companies/my-company" -Method Get -Headers $headers -ErrorAction Stop
            Write-Host "✅ Company Details:" -ForegroundColor Green
            Write-Host "  Name: $($companyResponse.name)" -ForegroundColor White
            Write-Host "  Slug: $($companyResponse.slug)" -ForegroundColor White
            Write-Host "  AI Enabled: $($companyResponse.aiEnabled)" -ForegroundColor White
            
            if ($companyResponse.aiApiKey) {
                Write-Host "  AI Key: Present ✅" -ForegroundColor Green
            } else {
                Write-Host "  AI Key: Missing ❌" -ForegroundColor Red
                Write-Host ""
                Write-Host "⚠️  WARNING: Company has no AI API key!" -ForegroundColor Yellow
                Write-Host "   Please add an AI API key in company settings." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ Failed to fetch company details: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "  CompanyId: NULL ❌" -ForegroundColor Red
        Write-Host ""
        Write-Host "❌ USER HAS NO COMPANYID!" -ForegroundColor Red
        Write-Host ""
        Write-Host "This is the problem! The user needs a companyId." -ForegroundColor Yellow
        Write-Host "Possible causes:" -ForegroundColor Yellow
        Write-Host "  1. User was created before companyId was added" -ForegroundColor Yellow
        Write-Host "  2. User is a SUPER_ADMIN (which is correct for system admin)" -ForegroundColor Yellow
        Write-Host "  3. Database issue during company creation" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "JWT TOKEN ANALYSIS" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    
    # Decode JWT (just the payload part)
    $parts = $token.Split('.')
    if ($parts.Length -eq 3) {
        $payload = $parts[1]
        # Add padding if needed
        while ($payload.Length % 4 -ne 0) {
            $payload += "="
        }
        $decodedBytes = [System.Convert]::FromBase64String($payload)
        $decodedText = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
        $jwtPayload = $decodedText | ConvertFrom-Json
        
        Write-Host ""
        Write-Host "JWT Payload:" -ForegroundColor White
        Write-Host "  User ID (sub): $($jwtPayload.sub)" -ForegroundColor White
        Write-Host "  Email: $($jwtPayload.email)" -ForegroundColor White
        Write-Host "  Role: $($jwtPayload.role)" -ForegroundColor White
        
        if ($jwtPayload.companyId) {
            Write-Host "  CompanyId: $($jwtPayload.companyId)" -ForegroundColor Green
            Write-Host ""
            Write-Host "✅ JWT TOKEN HAS COMPANYID!" -ForegroundColor Green
        } else {
            Write-Host "  CompanyId: NULL ❌" -ForegroundColor Red
            Write-Host ""
            Write-Host "❌ JWT TOKEN IS MISSING COMPANYID!" -ForegroundColor Red
            Write-Host ""
            Write-Host "🔧 SOLUTION: Log out and log back in to get a new token!" -ForegroundColor Yellow
        }
        
        # Check expiration
        if ($jwtPayload.exp) {
            $expDate = [DateTimeOffset]::FromUnixTimeSeconds($jwtPayload.exp).LocalDateTime
            Write-Host "  Expires: $expDate" -ForegroundColor White
            
            if ($expDate -lt (Get-Date)) {
                Write-Host ""
                Write-Host "⚠️  TOKEN IS EXPIRED!" -ForegroundColor Red
                Write-Host "   Please log in again." -ForegroundColor Yellow
            }
        }
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ Failed to fetch user profile" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host ""
        Write-Host "🔧 401 Unauthorized - Possible causes:" -ForegroundColor Yellow
        Write-Host "  1. Token is invalid or expired" -ForegroundColor Yellow
        Write-Host "  2. Token doesn't have companyId" -ForegroundColor Yellow
        Write-Host "  3. User doesn't exist in database" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "SOLUTION: Log out and log back in!" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "RECOMMENDATION" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Log out from the application" -ForegroundColor White
Write-Host "2. Clear browser cache/localStorage" -ForegroundColor White
Write-Host "3. Log back in with your credentials" -ForegroundColor White
Write-Host "4. Try AI features again" -ForegroundColor White
Write-Host ""

