# Test AI Generate Content Endpoint
# This script tests if the backend AI endpoint is working and using the correct API key

$BACKEND_URL = "https://taskmanagement-backendv2.onrender.com"

Write-Host "=== Testing AI Generate Content Endpoint ===" -ForegroundColor Cyan
Write-Host ""

# First, we need to login to get a token
Write-Host "Step 1: Login to get authentication token..." -ForegroundColor Yellow

# You'll need to provide actual credentials here
$loginEmail = Read-Host "Enter your email"
$loginPassword = Read-Host "Enter your password" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($loginPassword))

$loginBody = @{
    email = $loginEmail
    password = $plainPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.accessToken
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "User: $($loginResponse.user.name)" -ForegroundColor Cyan
    Write-Host "Role: $($loginResponse.user.role)" -ForegroundColor Cyan
    Write-Host "Company ID: $($loginResponse.user.companyId)" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Now test the AI generate-content endpoint
Write-Host "Step 2: Testing AI generate-content endpoint..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$aiBody = @{
    title = "Create marketing campaign"
    type = "task"
} | ConvertTo-Json

try {
    $aiResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/ai/generate-content" -Method Post -Headers $headers -Body $aiBody
    Write-Host "✅ AI generation successful!" -ForegroundColor Green
    Write-Host "AI Provider: $($aiResponse.ai_provider)" -ForegroundColor Cyan
    Write-Host "Description: $($aiResponse.description.Substring(0, [Math]::Min(100, $aiResponse.description.Length)))..." -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "❌ AI generation failed!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    # Try to get more details from the response
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Response Body: $responseBody" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan

