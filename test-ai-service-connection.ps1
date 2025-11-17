# Test if backend can reach AI service
$AI_SERVICE_URL = "https://apliman-marketing-task-management.onrender.com"

Write-Host "Testing AI Service Connection..." -ForegroundColor Cyan
Write-Host "AI Service URL: $AI_SERVICE_URL" -ForegroundColor Yellow
Write-Host ""

# Test health endpoint
try {
    Write-Host "1. Testing /health endpoint..." -ForegroundColor White
    $response = Invoke-RestMethod -Uri "$AI_SERVICE_URL/health" -Method Get -TimeoutSec 10
    Write-Host "✅ Health check passed!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor White
    Write-Host "   Provider: $($response.provider)" -ForegroundColor White
} catch {
    Write-Host "❌ Health check failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test chat endpoint
try {
    Write-Host "2. Testing /chat endpoint..." -ForegroundColor White
    $body = @{
        message = "Hello"
        api_key = "test-key"
        company_name = "Test Company"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$AI_SERVICE_URL/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ Chat endpoint responded!" -ForegroundColor Green
    Write-Host "   Response: $($response.message.Substring(0, [Math]::Min(100, $response.message.Length)))..." -ForegroundColor White
} catch {
    Write-Host "❌ Chat endpoint failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan

