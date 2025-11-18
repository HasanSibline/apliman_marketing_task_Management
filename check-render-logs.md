# Check Render Backend Logs

Since the user has re-logged in and we're still getting a 500 error, we need to check the actual backend logs on Render to see what's failing.

## Steps to Check Logs:

1. Go to https://dashboard.render.com
2. Find your backend service
3. Click on "Logs" tab
4. Look for recent errors around the time you tried to generate AI content

## What to Look For:

Look for log entries that contain:
- `🎯 generateContentFromAI called`
- `🔍 Looking up user:`
- `👤 User found:`
- `🏢 Company found:`
- `📚 Knowledge sources:`
- Any error messages or stack traces

## Expected Flow:

If everything is working, you should see:
```
🎯 generateContentFromAI called - Title: "...", Type: "...", UserId: 3a6efd8e-3a58-4f9a-95a0-41f9e52460ed
🔍 Looking up user: 3a6efd8e-3a58-4f9a-95a0-41f9e52460ed
👤 User found: Angy Barakat (angy.barakat@apliman.com), Role: COMPANY_ADMIN, CompanyId: c5b9399a-9b94-4a11-b1f4-53a1477284ea
🏢 Company found: Apliman, AI Enabled: true, Has API Key: true
📚 Knowledge sources: X sources found
🌐 Calling AI service at: https://ai-service-url.onrender.com/generate-content
📤 Request payload: {...}
✅ AI service responded: 200
📥 Response data: {...}
```

## Possible Issues:

1. **Company has no AI API key** - Check if Apliman company has an AI key set
2. **AI service is down** - Check if the Python AI service is running
3. **AI service timeout** - The AI service might be in cold start
4. **Invalid API key** - The AI key might be wrong or expired
5. **Knowledge sources error** - Issue fetching knowledge sources

## Quick Fixes:

### If AI Key is Missing:
1. Login as Super Admin
2. Go to Companies page
3. Edit Apliman company
4. Add a valid Google Gemini API key
5. Save and try again

### If AI Service is Down:
1. Check the AI service logs on Render
2. Make sure it's deployed and running
3. Check the health endpoint: `https://your-ai-service.onrender.com/health`

### If it's a Cold Start:
- Just wait 30-60 seconds and try again
- The first request after inactivity takes longer

