# ApliChat - AI Chatbot System

## Overview

ApliChat is an advanced AI-powered chatbot integrated into the Apliman Task Management System. It provides intelligent, context-aware assistance to users, remembering conversations, learning user preferences, and accessing both Apliman and competitor knowledge sources.

## Features

### 🌐 **Versatile AI Assistant**
- **General Knowledge**: Answer ANY question on any topic (technology, science, business, etc.)
- **Domain Expert**: Specialized knowledge about Apliman's task management system
- **Dual Purpose**: Seamlessly handles both general queries and system-specific questions

### 🧠 **Memory & Context**
- **Persistent Memory**: ApliChat remembers information across sessions
- **User Context**: Learns user preferences, name, role, and work patterns
- **Conversation History**: Maintains recent conversation context for coherent discussions

### 🎯 **Smart Integrations**
- **Task References**: Use `/task-name` to reference specific tasks
- **User Mentions**: Use `@username` to mention team members
- **Knowledge Sources**: Accesses Apliman and competitor information for informed responses

### 💬 **Conversation Modes**
- **Concise Mode**: Short, friendly responses (default)
- **Deep Analysis**: Detailed explanations when keywords like "deep", "details", or "explain" are used

### 🎨 **Professional UI**
- **Floating Button**: Always accessible from any page
- **Modern Design**: Beautiful gradient design with smooth animations
- **Typing Indicator**: Real-time "ApliChat is writing..." animation
- **Confirm Close**: Asks for confirmation before ending conversations
- **Avatar Circles**: Professional user and bot avatars

## Architecture

### Database Schema

```prisma
model ChatSession {
  id        String        @id @default(uuid())
  userId    String
  user      User
  title     String        @default("New Chat")
  isActive  Boolean       @default(true)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  endedAt   DateTime?
  messages  ChatMessage[]
}

model ChatMessage {
  id        String      @id @default(uuid())
  sessionId String
  session   ChatSession
  role      String      // "user" or "assistant"
  content   String      @db.Text
  metadata  Json?       // For mentions, task refs, etc.
  createdAt DateTime    @default(now())
}

model UserChatContext {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User
  context   Json     // Learned information
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Backend API Endpoints

#### **POST /api/chat/message**
Send a message to ApliChat

**Request:**
```json
{
  "message": "What tasks are assigned to @John?",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "sessionId": "session-uuid",
  "message": {
    "id": "message-uuid",
    "content": "John has 3 active tasks...",
    "createdAt": "2025-01-15T10:30:00Z"
  },
  "typing": false
}
```

#### **GET /api/chat/history**
Get user's chat history

**Query Parameters:**
- `limit`: Number of sessions to retrieve (default: 10)

**Response:**
```json
[
  {
    "id": "session-uuid",
    "title": "What tasks are assigned",
    "isActive": false,
    "createdAt": "2025-01-15T10:00:00Z",
    "messages": [...]
  }
]
```

#### **GET /api/chat/session/:sessionId**
Get specific chat session

#### **POST /api/chat/session/:sessionId/end**
End a chat session

#### **GET /api/chat/context**
Get user's learned context

### AI Service

#### **POST /chat** (Python AI Service)
Process chat messages with Gemini AI

**Features:**
- Extracts user mentions (@) and task references (/)
- Fetches relevant context from database
- Accesses knowledge sources (Apliman & competitors)
- Learns new information about users
- Adjusts response length based on keywords

**Request:**
```json
{
  "message": "Tell me about Apliman",
  "userContext": {"name": "Hasan"},
  "user": {"id": "...", "name": "...", "role": "..."},
  "conversationHistory": [...],
  "knowledgeSources": [...],
  "additionalContext": {...},
  "isDeepAnalysis": false
}
```

**Response:**
```json
{
  "message": "Apliman is a marketing task management platform...",
  "contextUsed": true,
  "learnedContext": {
    "name": "Hasan"
  }
}
```

## Frontend Components

### **FloatingChatButton**
- Location: `frontend/src/components/chat/FloatingChatButton.tsx`
- Floating button with pulse animation
- Tooltip on hover
- Opens ApliChat on click

### **ApliChat**
- Location: `frontend/src/components/chat/ApliChat.tsx`
- Main chat interface
- Features:
  - Message history display
  - Real-time typing indicator
  - User and bot avatars
  - Auto-scroll to latest message
  - Confirm close dialog
  - Session management
  - Error handling

## Usage Examples

### General Knowledge Questions
```
User: What is artificial intelligence?
ApliChat: AI is technology that enables machines to simulate human intelligence, including learning, reasoning, and problem-solving.

User: How do I improve team productivity?
ApliChat: Here are key strategies: Set clear goals, use collaboration tools, minimize meetings, provide feedback, and ensure work-life balance.

User: What's the weather like? (or any real-time info)
ApliChat: I don't have access to real-time data, but I can help you with general knowledge or your tasks!
```

### Basic Conversation
```
User: Hello
ApliChat: Hi! How can I help you today?

User: My name is Hasan
ApliChat: Nice to meet you, Hasan! I'll remember that.
```

### Task Queries
```
User: List tasks assigned to @Sarah
ApliChat: Sarah has 2 active tasks:
1. Marketing Campaign - Due: Jan 20
2. Content Review - Due: Jan 18
```

### Task References
```
User: Tell me about /Marketing-Campaign
ApliChat: The Marketing Campaign task is currently in the "In Progress" phase. It's assigned to Sarah with priority 4 and due on January 20, 2025...
```

### Knowledge Queries
```
User: How is Apliman better than competitors?
ApliChat: Based on our knowledge sources, Apliman offers several advantages:
- Integrated AI content generation
- Flexible workflow management
- Real-time collaboration features
...
```

### Deep Analysis
```
User: Explain in detail how the workflow system works
ApliChat: [Provides comprehensive explanation with all details]
```

### Mixed Conversations
```
User: What is Scrum?
ApliChat: Scrum is an agile framework for project management using sprints, daily standups, and iterative development.

User: Can we implement Scrum in Apliman?
ApliChat: Absolutely! Apliman's workflow system is perfect for Scrum. You can create workflows for sprints, use phases for backlog/in-progress/done, and track tasks through the cycle.
```

## Deployment

### Database Migration

The migration file is located at:
```
backend/prisma/migrations/20250115000000_add_aplichat_system/migration.sql
```

This will be automatically applied on the next production deployment.

### Environment Variables

No additional environment variables needed - ApliChat uses existing:
- `DATABASE_URL` (PostgreSQL)
- `AI_SERVICE_URL` (Python AI service)
- `GEMINI_API_KEY` (Google Gemini API)

### Production Checklist

✅ Database schema updated
✅ Backend API endpoints created
✅ Python AI service integrated
✅ Frontend components created
✅ Chat button added to layout
✅ Migration file created

## Key Features Summary

### 🎯 Core Capabilities
- ✅ **General knowledge AI** - Answer ANY question on any topic
- ✅ **Domain expertise** - Specialized knowledge about task management
- ✅ Persistent chat sessions
- ✅ User context memory (remembers name, preferences, etc.)
- ✅ Real-time typing indicators
- ✅ Conversation history
- ✅ Task references with `/`
- ✅ User mentions with `@`
- ✅ Knowledge source integration
- ✅ Deep vs. concise responses
- ✅ Professional UI with animations
- ✅ Confirm before closing chat
- ✅ Auto-generated session titles
- ✅ Error handling and fallbacks

### 🔒 Security
- JWT authentication required
- User-specific sessions and context
- Cascade deletion on user removal

### 🎨 UI/UX
- Floating button with pulse animation
- Modern gradient design
- Smooth transitions
- Avatar circles for messages
- Timestamp display
- Auto-scroll to latest message
- Responsive design

## Future Enhancements (Optional)

1. **Voice Input**: Add speech-to-text capability
2. **File Sharing**: Allow users to share files with ApliChat
3. **Quick Actions**: Buttons for common actions ("Create Task", "View My Tasks")
4. **Chat Export**: Export conversation history
5. **Multi-language Support**: Respond in user's preferred language
6. **Proactive Suggestions**: ApliChat suggests tasks or improvements
7. **Integration with Calendar**: "What's on my schedule?"

## Testing

### Manual Testing Checklist

1. **Basic Chat**
   - [ ] Open chat button appears
   - [ ] Click opens chat window
   - [ ] Send message works
   - [ ] Receive response
   - [ ] Typing indicator shows

2. **Memory**
   - [ ] Tell name, close chat, reopen
   - [ ] ApliChat remembers name

3. **Task References**
   - [ ] Type `/task-name`
   - [ ] ApliChat fetches task details

4. **User Mentions**
   - [ ] Type `@username`
   - [ ] ApliChat shows user's tasks

5. **Knowledge Sources**
   - [ ] Ask about Apliman
   - [ ] Ask about competitors
   - [ ] Responses use knowledge base

6. **Close Confirmation**
   - [ ] Click X button
   - [ ] Confirmation dialog appears
   - [ ] Can cancel or confirm

## Support

For issues or questions:
1. Check browser console for errors
2. Verify AI service is running
3. Check database connection
4. Review Render logs for backend errors

## Credits

**Developed by**: AI Assistant
**Date**: January 15, 2025
**Technology Stack**:
- Backend: NestJS, TypeScript, Prisma
- AI Service: FastAPI, Python, Google Gemini
- Frontend: React, TypeScript, TailwindCSS
- Database: PostgreSQL

