# Testing the AI Learning System

## Quick Test Guide

### Test 1: Basic Name Correction ✓

**Steps:**
1. Open ApliChat in the application
2. Send: `"My name is Hasan"`
3. Bot should respond acknowledging the name
4. Send: `"Actually, my name is Ahmad"`
5. Bot should correct itself and use "Ahmad"

**Verify:**
- Check backend logs for: `✅ Updated context for user`
- Call API: `GET /chat/context` and verify `name: "Ahmad"` (not "Hasan")

---

### Test 2: Multiple Corrections ✓

**Steps:**
1. Send: `"I prefer brief responses"`
2. Send: `"Actually, I prefer detailed explanations"`
3. Send: `"Can you tell me about Apliman?"`

**Expected:**
- Bot should give a detailed response (not brief)
- Context should show: `preferences: "detailed explanations"`

---

### Test 3: Task History Learning ✓

**Prerequisites:**
- Have at least 2-3 completed tasks in the system

**Steps:**
1. Call API: `POST /chat/learn-from-tasks`
2. Check response for `learnedContext`
3. Ask bot: `"What do you know about my work?"`

**Expected:**
- Bot should mention your work areas based on completed tasks
- Bot should describe your expertise

---

### Test 4: Domain Interest Learning ✓

**Steps:**
1. Ask: `"What features does Apliman have?"`
2. Ask: `"How does Apliman compare to competitors?"`
3. Ask: `"What are Apliman's pricing options?"`
4. Check backend logs for: `✅ Learned apliman interests`

**Expected:**
- After 3 questions, system learns you're interested in features/pricing
- Future Apliman questions get more detailed responses about these topics

---

### Test 5: Background Learning ✓

**Verify Setup:**
1. Check that `ChatLearningService` is registered in `chat.module.ts`
2. Check backend logs on startup for scheduler registration
3. Wait for scheduled time or manually trigger

**Expected Logs:**
```
Starting scheduled learning from task history...
✅ Learned from user John's task history
✅ Scheduled learning complete: X/X users processed
```

---

## API Test Endpoints

### 1. Get User Context
```bash
curl -X GET http://localhost:3000/chat/context \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Trigger Manual Learning
```bash
curl -X POST http://localhost:3000/chat/learn-from-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Send Chat Message
```bash
curl -X POST http://localhost:3000/chat/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My name is Ahmad",
    "sessionId": null
  }'
```

---

## Verification Checklist

Before testing, ensure:
- [ ] Backend is running (`npm run start:dev`)
- [ ] AI service is running (port 8000)
- [ ] GOOGLE_API_KEY is configured
- [ ] AI_SERVICE_URL is set correctly
- [ ] Database is accessible
- [ ] You're logged in to the application

---

## Expected Behavior

### ✓ Corrections Work
- Old values are replaced with new ones
- Not accumulated (no "Hasan and Ahmad")
- Immediate effect in next response

### ✓ Arrays Merge
- Skills: ["design"] + ["coding"] = ["design", "coding"]
- No duplicates
- Preserves both old and new

### ✓ Objects Merge
```json
Old: { "preferences": { "theme": "dark" } }
New: { "preferences": { "style": "detailed" } }
Result: { "preferences": { "theme": "dark", "style": "detailed" } }
```

### ✓ Learning Happens
- Every message is analyzed
- Context updates logged
- Persistent across sessions

---

## Troubleshooting

### Bot not learning
**Check:**
1. Backend logs for errors
2. AI service is accessible: `curl http://localhost:8000/health`
3. Context endpoint returns data: `GET /chat/context`

### Corrections not working
**Check:**
1. Look for log: `✅ Updated context for user`
2. Verify AI service returned `learnedContext`
3. Check context directly via API

### Background learning not running
**Check:**
1. ScheduleModule imported in app.module.ts
2. Backend logs show scheduler registration
3. Time is correct (scheduler uses server time)

---

## Success Criteria

✅ **Name corrections work**
   - Update immediately
   - Old name not used anymore

✅ **Task learning works**
   - Extracts expertise from completed tasks
   - Bot references your work in responses

✅ **Domain learning works**
   - Tracks questions by topic
   - Tailors responses to interests

✅ **Background learning works**
   - Scheduled jobs run
   - Multiple users processed
   - Logs show success

---

## Manual Test Script

Run these commands in order and verify results:

```bash
# 1. Check AI service health
curl http://localhost:8000/health

# 2. Login and get token (replace with your credentials)
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.access_token')

# 3. Get initial context
curl -X GET http://localhost:3000/chat/context \
  -H "Authorization: Bearer $TOKEN"

# 4. Send message with name
curl -X POST http://localhost:3000/chat/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"My name is Hasan","sessionId":null}'

# 5. Check context (should show name: "Hasan")
curl -X GET http://localhost:3000/chat/context \
  -H "Authorization: Bearer $TOKEN"

# 6. Correct the name
curl -X POST http://localhost:3000/chat/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Actually, my name is Ahmad","sessionId":null}'

# 7. Verify correction (should show name: "Ahmad", not "Hasan")
curl -X GET http://localhost:3000/chat/context \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.context.name'
# Expected output: "Ahmad"

# 8. Trigger task learning
curl -X POST http://localhost:3000/chat/learn-from-tasks \
  -H "Authorization: Bearer $TOKEN"

# 9. Check updated context (should have work_areas, expertise, skills)
curl -X GET http://localhost:3000/chat/context \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.context'
```

---

## Performance Notes

- Each learning operation takes 1-3 seconds (AI processing)
- Background learning doesn't affect user experience
- Context updates are immediate after learning
- Scheduled jobs have built-in delays to avoid overload

---

## Next Steps After Testing

1. ✅ Verify all tests pass
2. ✅ Check logs for any errors
3. ✅ Test with real user scenarios
4. ✅ Monitor background learning jobs
5. ✅ Review learned context for accuracy

If all tests pass, the system is working correctly! 🎉

