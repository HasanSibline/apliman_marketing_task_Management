#!/bin/bash
# 🧪 Quick API Health Check Script
# Tests critical backend endpoints

echo "🧪 Starting API Health Check..."
echo "================================"
echo ""

# Configuration
BACKEND_URL="https://taskmanagement-backendv2.onrender.com/api"
AI_SERVICE_URL="https://taskmanagement-ai-service.onrender.com"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3
    local method=${4:-GET}
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 30)
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" --max-time 30)
    fi
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Status: $response)"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $response)"
        ((FAILED++))
    fi
}

echo "📍 BACKEND HEALTH CHECKS"
echo "------------------------"

# Test 1: Backend Health
test_endpoint "Backend Health" "$BACKEND_URL/health" "200"

# Test 2: Backend Keepalive
test_endpoint "Backend Keepalive" "$BACKEND_URL/keepalive" "200"

# Test 3: Public endpoint (no auth required)
test_endpoint "Public Endpoint" "$BACKEND_URL/public/companies/by-slug/testslug" "404"

echo ""
echo "📍 AI SERVICE HEALTH CHECKS"
echo "----------------------------"

# Test 4: AI Service Health
test_endpoint "AI Service Health" "$AI_SERVICE_URL/health" "200"

# Test 5: AI Service Keepalive
test_endpoint "AI Service Keepalive" "$AI_SERVICE_URL/keepalive" "200"

echo ""
echo "📍 AUTHENTICATION ENDPOINTS"
echo "----------------------------"

# Test 6: Login endpoint exists (should return 401 or 400 without credentials)
test_endpoint "Login Endpoint" "$BACKEND_URL/auth/login" "400" "POST"

# Test 7: Admin login endpoint exists
test_endpoint "Admin Login Endpoint" "$BACKEND_URL/auth/admin-login" "400" "POST"

echo ""
echo "================================"
echo "📊 TEST SUMMARY"
echo "================================"
echo -e "${GREEN}✓ Passed:${NC} $PASSED"
echo -e "${RED}✗ Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo "Backend and AI services are healthy and responding."
    exit 0
else
    echo -e "${YELLOW}⚠️  SOME TESTS FAILED${NC}"
    echo "Please check the services that failed above."
    exit 1
fi

