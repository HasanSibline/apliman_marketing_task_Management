# AI Learning System Documentation

## Overview
The AI Learning System enables ApliChat to intelligently learn from user interactions, task history, and corrections. This system ensures that the chatbot continuously improves and remembers important information about users.

## Key Features

### 1. **Intelligent Context Extraction**
- Uses AI to extract information from conversations
- Handles corrections and updates automatically
- Recognizes when users correct previous information
- Extracts: names, preferences, work details, interests, and more

### 2. **Automatic Corrections**
- When a user corrects information (e.g., "my name is X" after previously saying "my name is Y"), the system automatically updates
- New values override old values
- Arrays are merged and deduplicated
- Nested objects are merged intelligently

### 3. **Task History Learning**
- Analyzes completed and active tasks to understand:
  - User's work areas and expertise
  - Common task types
  - Skills and responsibilities
  - Work patterns
- Automatically runs daily at 2 AM for active users
- Also runs every 6 hours for users with recently completed tasks

### 4. **Domain-Specific Learning**
- Tracks questions about specific domains (Apliman, competitors, services, etc.)
- After 3+ questions on a topic, automatically learns user's interests
- Tailors future responses based on learned interests

### 5. **Background Learning**
- Scheduled daily learning at 2 AM (for all active users in last 7 days)
- Incremental learning every 6 hours (for users with recent task completions)
- Non-blocking, runs in background without affecting performance

## Architecture

### Frontend (ApliChat Component)
- `frontend/src/components/chat/ApliChat.tsx`
- Sends messages to backend
- Displays conversation history

### Backend Services

#### ChatService
- `backend/src/chat/chat.service.ts`
- Main chat orchestration
- Intelligent context merging
- Tracks domain questions
- Calls AI service for learning

#### ChatLearningService
- `backend/src/chat/chat-learning.service.ts`
- Background learning scheduler
- Cron jobs for automated learning
- Manual learning trigger endpoint

### AI Service

#### ChatService
- `ai-service/services/chat_service.py`
- Processes chat messages
- Integrates with ContextLearningService

#### ContextLearningService (NEW)
- `ai-service/services/context_learning.py`
- AI-powered context extraction
- Handles corrections and updates
- Learns from task history
- Learns domain interests

## API Endpoints

### Chat Endpoints
```
POST /chat/message
- Send a message to ApliChat
- Automatically learns from the message

GET /chat/history
- Get conversation history

POST /chat/session/:sessionId/end
- End a chat session

GET /chat/context
- Get user's learned context

POST /chat/learn-from-tasks
- Manually trigger learning from task history
```

### AI Service Endpoints
```
POST /chat
- Process chat message with context learning

POST /learn-from-tasks
- Learn from user's task history

POST /learn-domain-interests
- Learn about user's domain-specific interests
```

## How It Works

### 1. Message Processing Flow
```
User sends message → Backend ChatService
                   ↓
           Fetch user context + history
                   ↓
           Call AI Service /chat
                   ↓
    AI extracts context intelligently
                   ↓
     Update user context (merge intelligently)
                   ↓
          Track domain questions
                   ↓
         Return response to user
```

### 2. Context Merging Logic
```typescript
// For corrections/updates
old: { name: "Hasan" }
new: { name: "John" }
result: { name: "John" } // New value replaces old

// For arrays
old: { skills: ["coding"] }
new: { skills: ["design"] }
result: { skills: ["coding", "design"] } // Merged and deduplicated

// For nested objects
old: { preferences: { theme: "dark" } }
new: { preferences: { language: "en" } }
result: { preferences: { theme: "dark", language: "en" } } // Recursive merge
```

### 3. Background Learning Schedule
```
Daily at 2 AM:
- Find all users active in last 7 days
- Learn from each user's task history
- Extract work patterns and expertise

Every 6 hours:
- Find tasks completed in last 6 hours
- Learn from users involved in those tasks
- Update context with fresh insights
```

## Usage Examples

### Example 1: Name Correction
```
User: "My name is Hasan"
Bot: "Nice to meet you, Hasan!"

[Later in conversation]
User: "Actually, my name is John"
Bot: "Thanks for correcting me, John!"

[System automatically updates context]
Old: { name: "Hasan" }
New: { name: "John" } ✓
```

### Example 2: Learning from Tasks
```
User completes tasks:
- "Design marketing campaign for Product X"
- "Create social media strategy"
- "Analyze competitor marketing"

[System learns]
Context updated:
{
  work_areas: ["marketing", "design", "strategy"],
  expertise: "Marketing and creative campaign development",
  skills: ["design", "social media", "competitive analysis"],
  common_task_types: ["marketing", "analysis"]
}

[Future conversations]
User: "Help me with a new campaign"
Bot: "Based on your expertise in marketing campaigns and social media strategy, here's what I recommend..."
```

### Example 3: Domain Interest Learning
```
User asks 3+ questions about Apliman:
1. "What features does Apliman have?"
2. "How does Apliman compare to competitors?"
3. "What are Apliman's pricing plans?"

[System learns]
{
  apliman_interests: {
    topics_of_interest: ["features", "pricing", "comparison"],
    focus_areas: ["competitive advantage", "pricing"],
    detail_level: "high"
  }
}

[Future responses are tailored to user's interests]
```

## Manual Learning Trigger

Users can manually trigger learning from their task history:

```typescript
// From frontend
const response = await api.post('/chat/learn-from-tasks');
// Response: { success: true, learnedContext: {...}, message: "..." }
```

This is useful for:
- Immediately updating context after completing important tasks
- Forcing a refresh of learned information
- Testing the learning system

## Configuration

### Environment Variables
```
AI_SERVICE_URL=http://localhost:8000
GOOGLE_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.0-flash
```

### Learning Schedule
To modify the learning schedule, edit `backend/src/chat/chat-learning.service.ts`:

```typescript
// Change from daily at 2 AM
@Cron(CronExpression.EVERY_DAY_AT_2AM)

// To custom schedule (e.g., every 12 hours)
@Cron('0 */12 * * *')
```

## Database Schema

### UserChatContext
```prisma
model UserChatContext {
  id        String   @id @default(uuid())
  userId    String   @unique
  context   Json     // Stores all learned information
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Context structure:
```json
{
  "name": "John Doe",
  "preferred_name": "John",
  "work_areas": ["marketing", "design"],
  "expertise": "Marketing campaign development",
  "skills": ["design", "social media", "analytics"],
  "preferences": {
    "communication_style": "detailed",
    "work_style": "collaborative"
  },
  "apliman_interests": {
    "topics_of_interest": ["features", "pricing"],
    "focus_areas": ["competitive advantage"]
  },
  "lastUpdated": "2025-01-15T10:30:00Z"
}
```

## Benefits

1. **Personalized Experience**: Bot learns about each user individually
2. **Automatic Corrections**: No need to manually update user info
3. **Context-Aware Responses**: Better responses based on work history
4. **Continuous Improvement**: Gets smarter over time
5. **Domain Expertise**: Learns what users care about
6. **Task Intelligence**: Understands user's work patterns

## Troubleshooting

### Bot not learning from corrections
- Check backend logs for "Updated context for user" messages
- Verify AI service is running and accessible
- Check that GOOGLE_API_KEY is valid

### Background learning not running
- Verify ScheduleModule is imported in app.module.ts
- Check backend logs for "Starting scheduled learning" messages
- Ensure ChatLearningService is properly injected

### Learning from tasks not working
- Verify AI_SERVICE_URL is correct
- Check that /learn-from-tasks endpoint is accessible
- Review ai-service logs for errors

## Future Enhancements

Possible improvements:
- Learning from file uploads and comments
- Team-wide learning (sharing insights across team)
- Export/import learned context
- Learning analytics dashboard
- Confidence scores for learned information
- Forgetting mechanism (remove outdated information)

