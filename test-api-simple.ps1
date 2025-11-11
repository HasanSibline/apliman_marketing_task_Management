# Quick API Health Check
Write-Host "Testing API Health..." -ForegroundColor Cyan

$BACKEND = "https://taskmanagement-backendv2.onrender.com/api"
$AI_SERVICE = "https://taskmanagement-ai-service.onrender.com"

$passed = 0
$failed = 0

function Test-API {
    param($name, $url, $expected)
    Write-Host "Testing $name... " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
        $status = [int]$response.StatusCode
    } catch {
        $status = [int]$_.Exception.Response.StatusCode.value__
    }
    
    if ($status -eq $expected) {
        Write-Host "PASS ($status)" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "FAIL (Expected: $expected, Got: $status)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "`nBACKEND TESTS:" -ForegroundColor Yellow
Test-API "Backend Health" "$BACKEND/health" 200
Test-API "Backend Keepalive" "$BACKEND/keepalive" 200

Write-Host "`nAI SERVICE TESTS:" -ForegroundColor Yellow
Test-API "AI Health" "$AI_SERVICE/health" 200
Test-API "AI Keepalive" "$AI_SERVICE/keepalive" 200

Write-Host "`nRESULTS:" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red

if ($failed -eq 0) {
    Write-Host "`nALL TESTS PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSOME TESTS FAILED!" -ForegroundColor Yellow
    exit 1
}

