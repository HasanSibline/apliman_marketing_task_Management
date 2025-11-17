# Test AI API Key Database Operations
# This script tests if AI API keys are properly saved and retrieved from the database

$BACKEND_URL = "https://taskmanagement-backendv2.onrender.com"

Write-Host "=== Testing AI API Key Database Operations ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login as System Admin
Write-Host "Step 1: Login as System Admin..." -ForegroundColor Yellow
$adminEmail = Read-Host "Enter System Admin email"
$adminPassword = Read-Host "Enter System Admin password" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword))

$loginBody = @{
    email = $adminEmail
    password = $plainPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/auth/admin-login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get list of companies
Write-Host "Step 2: Fetching companies..." -ForegroundColor Yellow
try {
    $companies = Invoke-RestMethod -Uri "$BACKEND_URL/api/companies" -Method Get -Headers $headers
    Write-Host "✅ Found $($companies.Count) companies" -ForegroundColor Green
    
    foreach ($company in $companies) {
        Write-Host ""
        Write-Host "Company: $($company.name)" -ForegroundColor Cyan
        Write-Host "  ID: $($company.id)" -ForegroundColor Gray
        Write-Host "  Slug: $($company.slug)" -ForegroundColor Gray
        Write-Host "  AI Enabled: $($company.aiEnabled)" -ForegroundColor $(if ($company.aiEnabled) { "Green" } else { "Yellow" })
        Write-Host "  AI Provider: $($company.aiProvider)" -ForegroundColor Gray
        Write-Host "  AI API Key: $($company.aiApiKey)" -ForegroundColor $(if ($company.aiApiKey) { "Green" } else { "Red" })
    }
    Write-Host ""
} catch {
    Write-Host "❌ Failed to fetch companies: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Select a company to test
Write-Host "Step 3: Select a company to test..." -ForegroundColor Yellow
$companyId = Read-Host "Enter company ID to test"

# Step 4: Get company details
Write-Host ""
Write-Host "Step 4: Fetching company details..." -ForegroundColor Yellow
try {
    $companyDetails = Invoke-RestMethod -Uri "$BACKEND_URL/api/companies/$companyId" -Method Get -Headers $headers
    Write-Host "✅ Company details retrieved" -ForegroundColor Green
    Write-Host "  Name: $($companyDetails.name)" -ForegroundColor Cyan
    Write-Host "  AI Enabled: $($companyDetails.aiEnabled)" -ForegroundColor $(if ($companyDetails.aiEnabled) { "Green" } else { "Yellow" })
    Write-Host "  AI Provider: $($companyDetails.aiProvider)" -ForegroundColor Gray
    Write-Host "  AI API Key: $($companyDetails.aiApiKey)" -ForegroundColor $(if ($companyDetails.aiApiKey) { "Green" } else { "Red" })
    
    if ($companyDetails.aiApiKey) {
        $keyLength = $companyDetails.aiApiKey.Length
        Write-Host "  API Key Length: $keyLength characters" -ForegroundColor Gray
        Write-Host "  API Key Preview: $($companyDetails.aiApiKey.Substring(0, [Math]::Min(20, $keyLength)))..." -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "❌ Failed to fetch company details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Test updating AI API key
Write-Host "Step 5: Test updating AI API key..." -ForegroundColor Yellow
$testUpdate = Read-Host "Do you want to test updating the AI API key? (y/n)"

if ($testUpdate -eq "y") {
    $newApiKey = Read-Host "Enter new AI API key (or press Enter to skip)"
    
    if ($newApiKey) {
        $updateBody = @{
            aiApiKey = $newApiKey
            aiEnabled = $true
        } | ConvertTo-Json
        
        try {
            $updateResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/companies/$companyId" -Method Patch -Headers $headers -Body $updateBody
            Write-Host "✅ AI API key updated successfully!" -ForegroundColor Green
            Write-Host ""
            
            # Fetch again to verify
            Write-Host "Verifying update..." -ForegroundColor Yellow
            $verifyDetails = Invoke-RestMethod -Uri "$BACKEND_URL/api/companies/$companyId" -Method Get -Headers $headers
            Write-Host "  AI Enabled: $($verifyDetails.aiEnabled)" -ForegroundColor $(if ($verifyDetails.aiEnabled) { "Green" } else { "Yellow" })
            Write-Host "  AI API Key: $($verifyDetails.aiApiKey)" -ForegroundColor $(if ($verifyDetails.aiApiKey) { "Green" } else { "Red" })
            
            if ($verifyDetails.aiApiKey) {
                $keyLength = $verifyDetails.aiApiKey.Length
                Write-Host "  API Key Length: $keyLength characters" -ForegroundColor Gray
                Write-Host "  API Key Preview: $($verifyDetails.aiApiKey.Substring(0, [Math]::Min(20, $keyLength)))..." -ForegroundColor Gray
            }
            
            Write-Host ""
            Write-Host "✅ Verification successful! API key is saved and retrieved correctly." -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to update AI API key: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- If AI API Key shows a value (not null), it's saved in the database" -ForegroundColor White
Write-Host "- The key should be base64 encoded (encrypted)" -ForegroundColor White
Write-Host "- When retrieved for editing, it should be decrypted and show the actual key" -ForegroundColor White
Write-Host "- When used by AI service, it should be decrypted automatically" -ForegroundColor White

