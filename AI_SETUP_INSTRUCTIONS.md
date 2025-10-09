# AI Service Setup Instructions

## Problem: Getting Fallback AI Responses

If you're receiving fallback responses from the AI service instead of real AI-generated content, it means the Google API key is not properly configured.

## Solution: Set up Google Gemini API Key

### Step 1: Get a Google API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### Step 2: Configure the AI Service
1. Navigate to the `ai-service` directory
2. Create a `.env` file (copy from `env.example`):
   ```bash
   cp env.example .env
   ```
3. Open the `.env` file and replace `your_google_api_key_here` with your actual API key:
   ```
   GOOGLE_API_KEY=AIzaSyYourActualApiKeyHere
   ```

### Step 3: Restart the AI Service
```bash
cd ai-service
python main.py
```

## Verify Setup

1. Create a new task with a title like "Create social media post for aïda platform"
2. Click the "Generate AI Content" button
3. You should see:
   - Success message: "AI content generated successfully!"
   - Real AI-generated description and goals
   - If subtasks are enabled, you'll see AI-generated subtasks

## Expected vs Fallback Behavior

**✅ With API Key (Real AI):**
- Rich, contextual content about Apliman products
- Specific industry references
- Intelligent subtasks matched to workflow phases
- Success toast: "AI content generated successfully!"

**⚠️ Without API Key (Fallback):**
- Generic template content
- Warning toast: "Using fallback content - check AI service configuration"
- Basic subtasks with generic titles

## Troubleshooting

If you still get fallback responses after setting up the API key:

1. **Check API Key Format**: Should start with `AIzaSy`
2. **Check .env File Location**: Must be in `ai-service/.env`
3. **Restart AI Service**: Stop with Ctrl+C and restart with `python main.py`
4. **Check Console Logs**: Look for "✅ Gemini initialized successfully" message
5. **Verify API Quota**: Check your Google AI Studio quota usage

## API Key Security

- ⚠️ Never commit your `.env` file to git
- ✅ The `.env` file is already in `.gitignore`
- ✅ Keep your API key private and secure
