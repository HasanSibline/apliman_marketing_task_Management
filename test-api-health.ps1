# 🧪 Quick API Health Check Script (PowerShell)
# Tests critical backend endpoints

Write-Host "🧪 Starting API Health Check..." -ForegroundColor Cyan
Write-Host "================================`n"

# Configuration
$BACKEND_URL = "https://taskmanagement-backendv2.onrender.com/api"
$AI_SERVICE_URL = "https://taskmanagement-ai-service.onrender.com"

# Test counter
$script:PASSED = 0
$script:FAILED = 0

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int]$ExpectedStatus,
        [string]$Method = "GET"
    )
    
    Write-Host "Testing $Name... " -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
        $statusCode = [int]$response.StatusCode
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode.value__
    }
    
    if ($statusCode -eq $ExpectedStatus) {
        Write-Host "✓ PASS" -ForegroundColor Green -NoNewline
        Write-Host " (Status: $statusCode)"
        $script:PASSED++
    } else {
        Write-Host "✗ FAIL" -ForegroundColor Red -NoNewline
        Write-Host " (Expected: $ExpectedStatus, Got: $statusCode)"
        $script:FAILED++
    }
}

Write-Host "📍 BACKEND HEALTH CHECKS" -ForegroundColor Yellow
Write-Host "------------------------"

# Test 1: Backend Health
Test-Endpoint -Name "Backend Health" -Url "$BACKEND_URL/health" -ExpectedStatus 200

# Test 2: Backend Keepalive
Test-Endpoint -Name "Backend Keepalive" -Url "$BACKEND_URL/keepalive" -ExpectedStatus 200

# Test 3: Public endpoint (no auth required) - 404 is expected for non-existent slug
Test-Endpoint -Name "Public Endpoint (404 OK)" -Url "$BACKEND_URL/public/companies/by-slug/testslug" -ExpectedStatus 404

Write-Host "`n📍 AI SERVICE HEALTH CHECKS" -ForegroundColor Yellow
Write-Host "----------------------------"

# Test 4: AI Service Health
Test-Endpoint -Name "AI Service Health" -Url "$AI_SERVICE_URL/health" -ExpectedStatus 200

# Test 5: AI Service Keepalive
Test-Endpoint -Name "AI Service Keepalive" -Url "$AI_SERVICE_URL/keepalive" -ExpectedStatus 200

Write-Host "`n📍 AUTHENTICATION ENDPOINTS" -ForegroundColor Yellow
Write-Host "----------------------------"

# Test 6: Login endpoint exists (should return 400 without credentials)
Test-Endpoint -Name "Login Endpoint Exists" -Url "$BACKEND_URL/auth/login" -ExpectedStatus 400 -Method "POST"

# Test 7: Admin login endpoint exists
Test-Endpoint -Name "Admin Login Endpoint Exists" -Url "$BACKEND_URL/auth/admin-login" -ExpectedStatus 400 -Method "POST"

Write-Host "`n================================"
Write-Host "📊 TEST SUMMARY"
Write-Host "================================"
Write-Host "✓ Passed: " -NoNewline -ForegroundColor Green
Write-Host $script:PASSED
Write-Host "✗ Failed: " -NoNewline -ForegroundColor Red
Write-Host $script:FAILED
Write-Host ""

if ($script:FAILED -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "Backend and AI services are healthy and responding."
    exit 0
} else {
    Write-Host "⚠️  SOME TESTS FAILED" -ForegroundColor Yellow
    Write-Host "Please check the services that failed above."
    exit 1
}

