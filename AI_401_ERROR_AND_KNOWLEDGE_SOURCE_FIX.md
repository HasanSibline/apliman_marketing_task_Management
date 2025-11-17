# AI 401 Error and Knowledge Source Issues - Complete Fix

## Issues Reported

1. **401 Error on AI generation**: "AI service is temporarily unavailable"
2. **ApliChat not using knowledge sources**: Giving generic answers instead of using apliman.com content
3. **ApliChat making up information**: Inventing services instead of saying "I don't know"

---

## Root Causes

### Issue 1: 401 Error ✅ **KNOWN CAUSE**

**Root Cause**: Your JWT token doesn't include `companyId`

**Why**: We fixed the JWT strategy to include `companyId`, but your current token was issued BEFORE the fix. The old token doesn't have `companyId`, so when the backend tries to fetch your company's AI key, it fails.

**Solution**: **LOG OUT AND LOG BACK IN** to get a new token

---

### Issue 2: Knowledge Source Not Being Used ⚠️ **NEEDS INVESTIGATION**

**Possible Causes**:
1. Knowledge source wasn't scraped (no content in database)
2. Knowledge source has `isActive: false`
3. Knowledge source content is empty or failed to scrape
4. AI service not properly using the knowledge source content in prompts

---

### Issue 3: AI Making Up Information ⚠️ **AI HALLUCINATION**

**Root Cause**: Google Gemini (and most LLMs) tend to "hallucinate" - make up plausible-sounding information when they don't know the answer.

**Solution**: Need to improve prompts to be more strict about only using provided knowledge sources

---

## Step-by-Step Fix

### Step 1: ✅ Log Out and Log Back In (CRITICAL)

**Why**: Get new JWT token with `companyId`

**How**:
1. Click your profile/logout button
2. Go to `https://your-domain.com/apliman/login` (or your company slug)
3. Log in with your credentials
4. New token will include `companyId`
5. 401 errors will be fixed

---

### Step 2: ✅ Verify Knowledge Source Was Scraped

**Check in UI**:
1. Go to Knowledge Sources page
2. Find "https://www.apliman.com"
3. Check:
   - ✅ Is it Active?
   - ✅ Does it show "Last scraped" date?
   - ✅ Does it show character count?
   - ❌ Does it show "Scraping error"?

**If not scraped**:
1. Click "Scrape" button on the knowledge source
2. Wait for scraping to complete
3. Check if content was fetched

---

### Step 3: ⚠️ Fix AI Hallucination - Stricter Prompts

The AI is making up information because the prompts aren't strict enough. Let me fix this:


