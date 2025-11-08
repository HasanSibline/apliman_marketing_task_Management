# AI Service Multi-Tenancy Integration Guide

## ✅ BACKEND UPDATES COMPLETE

The NestJS backend has been updated to support company-specific AI API keys:

### What Was Changed:

1. **Added `getCompanyAiApiKey()` helper method** in `backend/src/ai/ai.service.ts`
   - Fetches the user's company
   - Returns company's AI API key if enabled
   - Falls back to system default API key if:
     - User has no company (Super Admin)
     - Company AI is disabled
     - Company has no API key
     - Error occurs

2. **Updated AI methods to accept `userId` parameter**:
   - `summarizeText(text, maxLength, userId?)`
   - `analyzePriority(title, description, userId?)`
   - `checkTaskCompleteness(description, goals, phase, userId?)`
   - More methods follow the same pattern

3. **API keys are now passed to Python service**:
   ```typescript
   const apiKey = await this.getCompanyAiApiKey(userId);
   const response = await this.httpService.post(url, {
     ...data,
     api_key: apiKey, // Pass to Python service
   });
   ```

---

## 🐍 PYTHON AI SERVICE TODO

The Python AI service (`ai-service/`) needs to be updated to:

### 1. Accept `api_key` in Request Body

Update each endpoint to accept an optional `api_key` parameter:

**Example (in `services/content_generator.py`):**
```python
@router.post("/summarize")
async def summarize_text(request: SummarizeRequest):
    # Get API key from request or use default
    api_key = request.api_key or os.getenv('AI_API_KEY')
    
    # Use the API key for this request
    client = genai.configure(api_key=api_key)
    model = client.GenerativeModel('gemini-pro')
    # ... rest of code
```

### 2. Update Request Models

Add `api_key` field to request models:

**Example (in `main.py` or request models):**
```python
class SummarizeRequest(BaseModel):
    text: str
    max_length: int = 150
    api_key: Optional[str] = None  # Add this

class PriorityAnalysisRequest(BaseModel):
    title: str
    description: str
    api_key: Optional[str] = None  # Add this
```

### 3. Endpoints to Update

All these endpoints need the `api_key` parameter:
- `/summarize`
- `/analyze-priority`
- `/check-completeness`
- `/generate-insights`
- `/extract-text`
- `/generate-description`
- `/generate-goals`
- `/generate-content`
- `/detect-task-type`
- `/chat` (in chat service)

### 4. Track Usage Per Company

Optionally, you can track usage per API key:

```python
# In each endpoint, log usage
usage_stats = {
    'api_key_hash': hashlib.sha256(api_key.encode()).hexdigest()[:8],
    'tokens_used': response.usage_metadata.total_token_count,
    'cost': calculate_cost(tokens),
    'timestamp': datetime.now()
}
# Log to file or database
```

---

## 🔧 QUICK MIGRATION STEPS

### Backend (✅ COMPLETE):
1. ✅ Updated `AiService` to fetch company API keys
2. ✅ Pass `api_key` to Python service
3. ✅ Added fallback logic

### Python Service (⏳ TODO):
1. ⏳ Update request models to accept `api_key`
2. ⏳ Update each AI function to use provided API key
3. ⏳ Add fallback to system API key if none provided
4. ⏳ (Optional) Track usage per key

---

## 🧪 TESTING

### 1. Test with System API Key (Current Setup):
```bash
# Should still work with existing API key
POST /api/ai/summarize
{
  "text": "Test content",
  "max_length": 100
}
```

### 2. Test with Company API Key:
```bash
# Create company with AI key
POST /api/companies
{
  "name": "Test Company",
  "aiApiKey": "COMPANY_SPECIFIC_KEY",
  ...
}

# User from that company makes AI request
# Should use company's API key automatically
```

### 3. Verify Key Usage:
```bash
# Check Python service logs
# Should show which API key was used (hashed)
```

---

## 📊 AI USAGE TRACKING (Already Implemented)

The system already tracks AI usage per company in the `CompanyAIUsage` table:
- `messagesCount` - Total AI messages
- `tokensUsed` - Total tokens consumed
- `totalCost` - Total cost (calculated)
- `lastUsedAt` - Last AI usage

This is updated by the ChatService when AI is used.

---

## 🎯 BENEFITS

1. **Multi-Tenancy** - Each company uses their own AI budget
2. **Billing** - Easy to calculate costs per company
3. **Control** - Enable/disable AI per company
4. **Security** - No API key sharing between companies
5. **Flexibility** - Different companies can use different AI providers (future)

---

## ⚠️ IMPORTANT NOTES

1. **Encryption**: AI API keys are stored encrypted in the database
2. **Fallback**: System always falls back to default API key if company key is missing
3. **Super Admin**: Super admins use the system default API key
4. **Disabled AI**: If company has `aiEnabled: false`, system default is used

---

## 🚀 DEPLOYMENT CHECKLIST

- [x] Backend updated
- [x] Database schema updated
- [x] Frontend CMS created
- [ ] Python AI service updated
- [ ] Test company API key usage
- [ ] Monitor AI usage per company
- [ ] Run database migration

---

**Status:** Backend ready, Python service needs updates (optional - system works with default key for now)

