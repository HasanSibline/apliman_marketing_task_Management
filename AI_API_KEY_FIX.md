# AI API Key Multi-Tenancy Fix

## Problem

The AI service was using **fallback environment API keys** (`GOOGLE_API_KEY` or `GOOGLE_API_KEYS`) instead of **company-specific API keys** provided by administrators. This caused:

1. **Quota exhaustion** on the shared environment keys
2. **No true multi-tenancy** - all companies were using the same API key
3. **Incorrect billing** - companies couldn't use their own API keys

## Root Cause

The Python AI service (`ai-service/main.py`) was not accepting or using the `api_key` parameter sent by the backend. Instead, it always fell back to environment variables.

### Affected Endpoints:
- `/generate-content` - Task description and goals generation
- `/chat` - ApliChat conversations
- `/generate-subtasks` - Subtask generation

## Solution

### 1. Python AI Service (`ai-service/main.py`)

**Changes:**
- Added `api_key: Optional[str]` parameter to all request models
- Modified endpoints to:
  1. **Prioritize company-provided API key** from the request
  2. **Fall back to environment keys** only if no company key is provided (with warning)
  3. **Create temporary service instances** with the provided API key (not shared global instances)

**Code Pattern:**
```python
# Extract API key from request
api_key_to_use = request.api_key

# Fallback to environment (with warning)
if not api_key_to_use:
    api_keys = config.get_api_keys()
    if not api_keys:
        raise HTTPException(status_code=400, detail="No API key provided")
    api_key_to_use = api_keys[0]
    logger.warning("Using fallback environment API key")

# Create temporary service with company key
temp_generator = ContentGenerator(api_key_to_use)
```

### 2. Backend AI Service (`backend/src/ai/ai.service.ts`)

**Changes:**
- `generateSubtasks()` now fetches company AI info and passes:
  - `api_key`: Company's decrypted API key
  - `company_name`: Actual company name

### 3. Backend Chat Service (`backend/src/chat/chat.service.ts`)

**Changes:**
- Changed `apiKey` to `api_key` (snake_case) to match Python service expectations

## Files Modified

### Python AI Service:
- `ai-service/main.py`
  - Updated `GenerateContentRequest` model
  - Updated `ChatRequest` model
  - Modified `/generate-content` endpoint
  - Modified `/chat` endpoint
  - Modified `/generate-subtasks` endpoint

### Backend Services:
- `backend/src/ai/ai.service.ts`
  - Updated `generateSubtasks()` method
- `backend/src/chat/chat.service.ts`
  - Fixed parameter name (`apiKey` → `api_key`)

## How It Works Now

### Flow for Task Creation:
1. User creates a task in company "Acme Corp"
2. Backend fetches Acme's AI API key from database (decrypted)
3. Backend sends request to AI service with:
   ```json
   {
     "title": "Design new homepage",
     "type": "task",
     "api_key": "AIzaSy...Acme's_Key",
     "company_name": "Acme Corp",
     "knowledge_sources": [...]
   }
   ```
4. AI service creates a **temporary ContentGenerator** with Acme's key
5. AI generates content using **Acme's quota**, not shared quota
6. Response is personalized with "Acme Corp" name

### Flow for ApliChat:
1. User chats in company "Beta Inc"
2. Backend fetches Beta's AI API key from database (decrypted)
3. Backend sends request to AI service with:
   ```json
   {
     "message": "Tell me about our company",
     "api_key": "AIzaSy...Beta's_Key",
     "companyName": "Beta Inc",
     "knowledgeSources": [...Beta's sources only],
     "user": {...},
     "conversationHistory": [...]
   }
   ```
4. AI service creates a **temporary ChatService** with Beta's key
5. AI responds using **Beta's quota** and **Beta's knowledge sources**
6. Response mentions "Beta Inc" specifically

## Benefits

✅ **True Multi-Tenancy**: Each company uses their own API key
✅ **Isolated Quotas**: Company A's usage doesn't affect Company B
✅ **Accurate Billing**: Each company pays for their own usage
✅ **No Shared Quota Exhaustion**: Environment keys are only a fallback
✅ **Security**: API keys are encrypted in database, decrypted only when needed
✅ **Personalization**: AI responses use actual company names

## Testing

### Before Fix:
```
Error: All API keys exhausted. Quota exceeded
Code: 429 - RESOURCE_EXHAUSTED
```

### After Fix:
- Companies with their own API keys: ✅ Works with their quota
- Companies without API keys: ⚠️ Get clear error message
- Environment fallback: ⚠️ Only used as last resort (with warning logged)

## Migration Notes

### For Existing Companies:
1. Administrators should add their Google Gemini API key in the admin panel
2. Navigate to: Company Settings → AI Configuration
3. Add API key and enable AI
4. AI will now use the company's own quota

### For System Administrators:
1. Environment `GOOGLE_API_KEY` is now a **fallback only**
2. It's recommended to remove it or keep it for testing only
3. Production companies should always provide their own keys

## Environment Variables (Optional Fallback)

```env
# Optional: Fallback API key (not recommended for production)
GOOGLE_API_KEY=your_fallback_key_here

# Optional: Multiple fallback keys (comma-separated)
GOOGLE_API_KEYS=key1,key2,key3
```

⚠️ **Warning**: Fallback keys will be shared across all companies that don't have their own key. This is NOT recommended for production.

## Deployment

1. Deploy updated AI service (Python)
2. Deploy updated backend (Node.js)
3. No database migrations needed
4. Existing company API keys will work immediately
5. Monitor logs for "Using fallback environment API key" warnings

## Logs to Monitor

### Success (Company using own key):
```
✅ Using AI for company: Acme Corp
✅ Generated 5 subtasks
```

### Warning (Fallback being used):
```
⚠️ Using fallback environment API key - company should provide their own key
```

### Error (No key available):
```
❌ No API key provided. AI is not enabled for your company.
```

---

**Date**: November 14, 2024
**Status**: ✅ Fixed and Ready for Deployment

