# AI Service API Keys Troubleshooting Guide

## Overview
The AI service now supports **multiple API keys** with automatic fallback when one key reaches quota limits.

## How to Check API Keys Status

### Method 1: Health Check Endpoint
Visit: `https://apliman-marketing-task-management.onrender.com/health`

This will show:
```json
{
  "status": "healthy",
  "environment": "production",
  "gemini_status": "connected",
  "api_keys_configured": 2,
  "api_keys_preview": [
    "AIzaSyDXXX...XXXX",
    "AIzaSyBNRX...I7Ms"
  ]
}
```

### Method 2: API Keys Status Endpoint (NEW!)
Visit: `https://apliman-marketing-task-management.onrender.com/api-keys-status`

This endpoint tests **each API key individually** and shows:
```json
{
  "status": "ok",
  "keys_count": 2,
  "active_keys": 1,
  "keys": [
    {
      "index": 0,
      "preview": "AIzaSyDXXX...XXXX",
      "status": "quota_exceeded",
      "message": "Quota exceeded",
      "error": "You exceeded your current quota..."
    },
    {
      "index": 1,
      "preview": "AIzaSyBNRX...I7Ms",
      "status": "active",
      "message": "Working"
    }
  ]
}
```

## Configuration on Render

### Environment Variables
You have **two options** to configure multiple API keys:

#### Option 1: Comma-Separated (Recommended)
```
GOOGLE_API_KEYS=AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXX,AIzaSyBNRvRcBKbn7cbbktAxWIvh7quIAx4I7Ms
```

#### Option 2: Single Key (Fallback)
```
GOOGLE_API_KEY=AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Current Configuration
Based on your messages, you have:
- **Key 1**: `AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (Main - likely quota exceeded)
- **Key 2**: `AIzaSyBNRvRcBKbn7cbbktAxWIvh7quIAx4I7Ms` (Fallback)

## How Automatic Fallback Works

1. **Request comes in** → AI service tries Key 1
2. **Key 1 fails (429 quota)** → Automatically rotates to Key 2
3. **Key 2 works** → Request succeeds
4. **Both fail** → Returns error with fallback content

## Quota Limits (Google Gemini Free Tier)

Each API key has:
- **200 requests per day** for `gemini-2.0-flash` model
- Resets at midnight UTC

## Troubleshooting Steps

### 1. Verify Both Keys are Configured
```bash
# On Render dashboard, check environment variables
GOOGLE_API_KEYS should contain both keys comma-separated
```

### 2. Check Keys Status
Visit: `https://apliman-marketing-task-management.onrender.com/api-keys-status`

### 3. If Both Keys are Quota Exceeded

**Short-term solution:**
- Wait until midnight UTC for quota reset
- OR create additional Google API keys

**Long-term solution:**
- Upgrade to Google AI Studio paid tier
- Add more API keys to the rotation

### 4. Add More API Keys

To add a 3rd, 4th, etc. key:
```
GOOGLE_API_KEYS=key1,key2,key3,key4
```

The system will automatically use all keys in rotation.

## Expected Behavior

### ✅ Working Correctly
- Frontend shows: "AI service temporarily unavailable" when all keys exhausted
- Fallback content is generated (template description/goals)
- System continues to work with template content

### ❌ Something Wrong If:
- Service crashes or won't start
- No fallback content is generated
- Errors are not logged properly

## Monitoring

### Check AI Service Logs on Render
Look for these log messages:
- `✅ Gemini initialized with X API key(s)` - Shows how many keys loaded
- `🔄 Multiple API keys detected - automatic fallback enabled` - Confirms rotation is active
- `⚠️ API key X quota exceeded` - Shows when a key hits quota
- `🔄 Rotating API key from index X to Y` - Shows automatic rotation
- `✅ Request succeeded with fallback API key` - Shows fallback worked

## Recommendations

1. **Get 4-6 API keys** from Google AI Studio (free, multiple projects)
2. **Set all keys** in `GOOGLE_API_KEYS` comma-separated
3. **Monitor usage** via `/api-keys-status` endpoint
4. **Consider paid tier** if you need more than 200 requests/day per key

## Testing the System

### Test 1: Check Service Health
```bash
curl https://apliman-marketing-task-management.onrender.com/health
```

### Test 2: Check All Keys Status
```bash
curl https://apliman-marketing-task-management.onrender.com/api-keys-status
```

### Test 3: Try Content Generation
```bash
curl -X POST https://apliman-marketing-task-management.onrender.com/generate-content \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Task", "type": "task"}'
```

## Contact & Support

If issues persist:
1. Check Render logs for detailed error messages
2. Verify environment variables are set correctly
3. Confirm at least one API key has remaining quota
4. Test keys individually via `/api-keys-status`

---

**Last Updated**: October 12, 2025
**AI Service Version**: 1.0.0
**Deployment**: Render.com

