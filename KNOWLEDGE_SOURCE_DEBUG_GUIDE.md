# Knowledge Source Not Working - Debug Guide

## Issue

Knowledge source shows:
- ✅ Scraped: 11/17/2025, 12:30:58 PM
- ✅ Content: 688 characters
- ✅ Status: Active

But AI still says: "I don't have detailed information about Apliman yet."

---

## Possible Causes

### 1. **You Haven't Logged Out/In Yet** (Most Likely)

**Problem**: Your JWT token doesn't have `companyId`, so the backend can't fetch your company's knowledge sources.

**Solution**:
1. ⚠️ **LOG OUT**
2. ⚠️ **LOG BACK IN**
3. Get new token with `companyId`
4. Try asking about Apliman again

---

### 2. **Company Name Mismatch**

**Problem**: Your company name in the database might not be "Apliman"

**Check**:
1. What is your company name in the system?
2. The knowledge source is named "Apliman" - does it match your company name exactly?

**Example Issue**:
```
Company name in database: "Apliman Inc"
Knowledge source name: "Apliman"
AI looking for: "Apliman Inc"
Result: ❌ No match
```

**Solution**: Rename the knowledge source to match your exact company name, or vice versa.

---

### 3. **Content Format Issue**

**Problem**: The scraped content might be in an unexpected format

**Check**: Open browser console and look for the API response when you send a chat message:
```javascript
// Look for: POST /api/chat/message
// Check the response for knowledgeSources array
// Verify it has content field with actual text
```

---

### 4. **AI Service Not Receiving Content**

**Problem**: Backend might not be sending the content to the AI service

**Debug Steps**:

#### **Step 1: Check Backend Logs**

Look for logs like:
```
✅ Using AI for company: Apliman
Using 1 knowledge sources for content generation
```

If you see:
```
⚠️ Using 0 knowledge sources
```
Then the backend isn't finding the knowledge source.

#### **Step 2: Check AI Service Logs**

Look for logs in AI service showing:
```
=== About Apliman ===
[Source content here]
```

If you see:
```
⚠️ WARNING: No knowledge sources with content available
```
Then the AI service isn't receiving content.

---

## Quick Diagnostic Test

### **Test 1: Check if Knowledge Source is Being Fetched**

**In Browser Console** (when on ApliChat page):
```javascript
// Open Network tab
// Send message: "Tell me about Apliman"
// Look for POST request to /api/chat/message
// Check the response payload
```

**Expected Response**:
```json
{
  "message": "Apliman is...",
  "contextUsed": true,
  "learnedContext": null
}
```

**If you see 401 error**: You need to log out and log back in!

---

### **Test 2: Verify Company Name**

**Check your company name**:
1. Go to your profile or company settings
2. Note the exact company name
3. Go to Knowledge Sources
4. Check if the knowledge source name matches

**If they don't match**:
- Either rename the knowledge source
- Or the AI should still work because it uses `type: 'COMPANY'` not the name

---

### **Test 3: Check Knowledge Source Content**

**In Database** (if you have access):
```sql
SELECT 
  name, 
  type, 
  isActive, 
  LENGTH(content) as content_length,
  LEFT(content, 100) as content_preview
FROM "KnowledgeSource"
WHERE companyId = 'your-company-id';
```

**Expected**:
```
name: Apliman
type: COMPANY
isActive: true
content_length: 688
content_preview: [First 100 characters of scraped content]
```

**If content is NULL or empty**: Re-scrape the knowledge source

---

## Step-by-Step Fix

### **Step 1: Log Out and Log Back In** ⚠️ **DO THIS FIRST**

This is the **most likely cause** of the issue.

1. Click your profile → Logout
2. Go to `/apliman/login` (or your company slug)
3. Log in with your credentials
4. Try asking about Apliman again

**Why**: Your current token doesn't have `companyId`, so the backend can't fetch knowledge sources for your company.

---

### **Step 2: Verify Knowledge Source is Active**

1. Go to Knowledge Sources page
2. Check "Apliman" knowledge source
3. Verify:
   - ✅ Status: Active (green checkmark)
   - ✅ Last scraped: Recent date
   - ✅ Content: 688 characters

---

### **Step 3: Test in ApliChat**

1. Open ApliChat
2. Ask: "Tell me about Apliman"
3. Expected: AI uses the scraped content
4. If still doesn't work, check browser console for errors

---

### **Step 4: Check Browser Console**

**Open Developer Tools** (F12):

1. Go to **Console** tab
2. Look for errors (red text)
3. Common errors:
   - `401 Unauthorized` → You need to log out/in
   - `AI service error` → AI service issue
   - `Network Error` → Backend not reachable

---

### **Step 5: Force Re-scrape**

If content looks wrong:

1. Go to Knowledge Sources
2. Click the refresh icon (🔄) next to "Apliman"
3. Wait for scraping to complete
4. Verify content was updated
5. Try asking about Apliman again

---

## Expected Behavior

### **When Working Correctly**:

**You ask**: "Tell me about Apliman"

**Backend**:
1. Fetches your company ID from token
2. Queries knowledge sources for your company
3. Finds "Apliman" knowledge source with content
4. Sends content to AI service

**AI Service**:
1. Receives knowledge source with 688 characters of content
2. Builds prompt with Apliman information
3. Generates response using the scraped content
4. Returns personalized response

**You see**: "Apliman is [information from website]..."

---

### **Current Behavior (Not Working)**:

**You ask**: "Tell me about Apliman"

**AI says**: "I don't have detailed information about Apliman yet."

**This means**:
- ❌ AI service received NO content
- ❌ Either backend didn't send it
- ❌ Or token doesn't have `companyId`

---

## Most Likely Solution

Based on our earlier fixes, you **haven't logged out and logged back in yet**.

### **DO THIS NOW**:

1. ⚠️ **LOG OUT**
2. ⚠️ **LOG BACK IN**
3. ✅ Get new JWT token with `companyId`
4. ✅ Try asking about Apliman again

**This will fix**:
- ✅ 401 errors
- ✅ Knowledge sources not being fetched
- ✅ AI not having company information

---

## Verification

### **After Logging Out/In**:

**Test 1**: Ask "Tell me about Apliman"
- ✅ Expected: AI uses scraped content from apliman.com

**Test 2**: Ask "What services does Apliman offer?"
- ✅ Expected: AI answers based on website content

**Test 3**: Ask "How can I contact Apliman?"
- ✅ Expected: AI provides contact info from website

**Test 4**: Ask "What is the weather?"
- ✅ Expected: AI says "I cannot provide real-time weather information"

---

## If Still Not Working After Logout/Login

### **Check These**:

1. **Company Name**:
   - Your company name: _______
   - Knowledge source name: Apliman
   - Do they match? If not, that's OK - it should still work

2. **Knowledge Source Type**:
   - Type should be: `COMPANY` (not `COMPETITOR`)
   - Check in the UI - it should show "Apliman" badge

3. **Content**:
   - 688 characters is good
   - Should contain actual text from apliman.com
   - Not just HTML tags or error messages

4. **Backend Logs**:
   - Check Render logs for backend
   - Look for: "Using X knowledge sources"
   - Should be at least 1

5. **AI Service Logs**:
   - Check Render logs for AI service
   - Look for: "=== About Apliman ==="
   - Should show content

---

## Debug Commands

### **Check if Token Has companyId**:

**In Browser Console**:
```javascript
// Get token
const token = localStorage.getItem('token');

// Decode JWT (middle part)
const payload = JSON.parse(atob(token.split('.')[1]));

// Check payload
console.log('Token payload:', payload);

// Should have: companyId field
// If missing: LOG OUT AND LOG BACK IN
```

---

## Summary

| Issue | Cause | Solution |
|-------|-------|----------|
| **"I don't have information yet"** | Token missing `companyId` | ⚠️ **Log out and log back in** |
| **401 errors** | Old JWT token | ⚠️ **Log out and log back in** |
| **Knowledge source not found** | Company ID mismatch | Check company name |
| **Content is empty** | Scraping failed | Re-scrape the source |
| **Content is wrong** | Website changed | Re-scrape the source |

---

**The #1 most likely issue is that you haven't logged out and logged back in yet to get the new JWT token with `companyId`. Please do that first!** ⚠️

---

**Date**: November 17, 2024  
**Status**: ⚠️ **ACTION REQUIRED** - Log out and log back in

