# AI Learning System - How It Works

## ✅ YES! Your AI Learns from User Interactions

The AI **actively learns** from every conversation and interaction within each company. This learning is **company-specific** and **user-specific**.

---

## How the Learning System Works

### 1. **Context Learning (ApliChat)**

Every time a user chats with ApliChat, the AI:

#### **Extracts Information**:
- Personal info (name, nickname, preferences)
- Work details (role, responsibilities, projects)
- Interests and expertise
- Communication preferences
- Any factual information the user shares

#### **Updates Knowledge**:
- If user says "My name is John" → Stores: `name: "John"`
- If user later says "Call me Johnny" → Updates: `preferred_name: "Johnny"`
- If user says "I prefer morning meetings" → Stores: `meeting_preference: "morning"`
- If user corrects info → Replaces old value with new one

#### **Uses Learned Context**:
- Next conversation, AI remembers: "Hi Johnny! How are you?"
- AI knows preferences: "I know you prefer morning meetings, so..."
- AI personalizes responses based on learned information

---

### 2. **Task History Learning**

The AI also learns from:
- **Completed tasks** - What the user accomplished
- **Active tasks** - What the user is working on
- **Task patterns** - Types of work the user does
- **Work style** - How the user approaches tasks

This helps AI:
- Suggest relevant tasks
- Understand user's expertise
- Provide better recommendations
- Generate more relevant content

---

### 3. **Domain Interest Tracking**

The AI tracks what topics users ask about:
- Marketing questions → Learns user is interested in marketing
- Technical questions → Learns user has technical expertise
- Competitor questions → Learns user focuses on competitive analysis

This helps AI:
- Provide more relevant information
- Suggest related topics
- Understand user's role and focus areas

---

## Company-Specific Learning

### **Isolation by Company**

Each company's AI learning is **completely isolated**:

```
Company A (Apliman):
- User John's context: {name: "John", role: "Marketing Manager", ...}
- User Sarah's context: {name: "Sarah", role: "Designer", ...}

Company B (Monty):
- User Mike's context: {name: "Mike", role: "CEO", ...}
- User Lisa's context: {name: "Lisa", role: "Developer", ...}
```

**Company A's AI will NEVER see Company B's learned context.**

---

## What Gets Learned

### ✅ **Personal Information**
```
User: "My name is John Smith"
AI Learns: {name: "John Smith"}

User: "Call me John"
AI Learns: {preferred_name: "John"}

User: "I'm based in Beirut"
AI Learns: {location: "Beirut"}
```

### ✅ **Work Preferences**
```
User: "I prefer working in the morning"
AI Learns: {work_preference: "morning"}

User: "I like detailed reports"
AI Learns: {report_style: "detailed"}

User: "I focus on social media marketing"
AI Learns: {expertise: "social media marketing"}
```

### ✅ **Corrections & Updates**
```
User: "My name is John"
AI Learns: {name: "John"}

Later...
User: "Actually, my name is Jonathan"
AI Updates: {name: "Jonathan"} ← Replaces old value
```

### ✅ **Interests & Expertise**
```
User asks many questions about "competitor analysis"
AI Learns: {interests: ["competitor analysis"]}

User creates tasks about "content marketing"
AI Learns: {expertise: ["content marketing"]}
```

---

## How It's Stored

### **Database Structure**

```sql
UserChatContext {
  userId: string (unique per user)
  context: JSON {
    name: "John",
    preferred_name: "Johnny",
    role: "Marketing Manager",
    location: "Beirut",
    work_preference: "morning",
    interests: ["social media", "competitor analysis"],
    expertise: ["content marketing", "SEO"],
    lastUpdated: "2024-11-14T..."
  }
}
```

### **Context is Persistent**

- Stored in database (PostgreSQL/Neon)
- Survives across sessions
- Available in every conversation
- Updated intelligently (new values replace old ones)

---

## How Task Generation Uses Learning

### **Without Learning**:
```
Task: "Create social media campaign"
Description: "Develop a social media campaign to increase brand awareness..."
```

### **With Learning** (AI knows user is "Social Media Manager" interested in "Instagram"):
```
Task: "Create Instagram-focused social media campaign"
Description: "As the Social Media Manager, develop an Instagram-focused campaign 
leveraging your expertise in visual storytelling. Focus on:
- Instagram Reels and Stories
- Influencer partnerships
- User-generated content
- Analytics tracking

This aligns with your interest in Instagram marketing and your role..."
```

---

## Technical Implementation

### **1. Chat Flow with Learning**

```
User sends message
    ↓
Backend receives message
    ↓
Backend fetches user's existing context from database
    ↓
Backend sends to Python AI service:
  - Message
  - Existing context
  - Conversation history
  - Knowledge sources
    ↓
Python AI service:
  - Generates response
  - Extracts new/updated information using AI
  - Returns: {message, learnedContext}
    ↓
Backend receives response
    ↓
If learnedContext exists:
  - Merge with existing context
  - Save to database
    ↓
Return response to user
```

### **2. Context Extraction (Python AI)**

```python
# ai-service/services/context_learning.py

def extract_and_update_context(
    message: str,
    existing_context: Dict,
    conversation_history: List,
    user_info: Dict
) -> Optional[Dict]:
    """
    Uses AI to extract new information from user message
    
    Examples:
    - "My name is John" → {name: "John"}
    - "I prefer morning meetings" → {meeting_preference: "morning"}
    - "I'm a designer" → {role: "designer"}
    """
    
    # AI analyzes message and extracts structured information
    # Returns only NEW or UPDATED fields
    # Backend merges with existing context
```

### **3. Context Merging (Backend)**

```typescript
// backend/src/chat/chat.service.ts

async updateUserContext(userId: string, newContext: any) {
  const existing = await this.getUserContext(userId);
  
  // Intelligently merge - new values override old ones
  const updatedContext = this.mergeContextIntelligently(
    existing.context,
    newContext
  );
  
  // Save to database
  return this.prisma.userChatContext.update({
    where: { userId },
    data: { context: updatedContext },
  });
}
```

---

## Examples of Learning in Action

### **Example 1: Personal Information**

**Conversation 1**:
```
User: "Hi, I'm John"
AI: "Nice to meet you, John! How can I help you today?"
[Learns: {name: "John"}]
```

**Conversation 2** (Next day):
```
User: "Hello"
AI: "Hi John! Welcome back. What can I help you with today?"
[Uses learned context: name = "John"]
```

---

### **Example 2: Work Preferences**

**Conversation 1**:
```
User: "I'm working on a social media campaign"
AI: "Great! What platform are you focusing on?"
[Learns: {current_project: "social media campaign"}]

User: "Instagram, I love working with visual content"
AI: "Instagram is perfect for visual storytelling!"
[Learns: {preferred_platform: "Instagram", interest: "visual content"}]
```

**Conversation 2** (Later):
```
User: "I need ideas for a new campaign"
AI: "Since you love working with visual content on Instagram, 
     how about an Instagram Reels campaign featuring..."
[Uses learned context: preferred_platform, interest]
```

---

### **Example 3: Corrections**

**Conversation 1**:
```
User: "My name is John"
[Learns: {name: "John"}]
```

**Conversation 2**:
```
User: "Actually, my full name is Jonathan"
[Updates: {name: "Jonathan"}] ← Replaces "John"
```

**Conversation 3**:
```
AI: "Hi Jonathan! ..." ← Uses updated name
```

---

## Privacy & Security

### **Company Isolation**

- ✅ Each company has separate database records
- ✅ User context filtered by `companyId`
- ✅ Company A cannot see Company B's learned context
- ✅ Cross-company data leakage is impossible

### **User-Specific**

- ✅ Each user has their own context
- ✅ User A's learned info is separate from User B's
- ✅ Context is tied to `userId`

### **Data Control**

- ✅ Context stored in your database (not external service)
- ✅ You control the data
- ✅ Can be deleted/reset if needed

---

## Limitations & Considerations

### **What AI Learns**:
- ✅ Information explicitly shared by user
- ✅ Preferences mentioned in conversation
- ✅ Work patterns from task history
- ✅ Interests from questions asked

### **What AI Does NOT Learn**:
- ❌ Private information not shared
- ❌ Information from other users
- ❌ Information from other companies
- ❌ Sensitive data (passwords, etc.)

### **Learning Quality**:
- Depends on conversation quality
- More interactions = better learning
- Explicit information is learned better than implicit
- AI may not catch subtle hints

---

## How to Leverage Learning

### **For Users**:

1. **Share Information**:
   - "I'm a designer focused on branding"
   - "I prefer morning meetings"
   - "I'm working on the Q4 campaign"

2. **Correct Mistakes**:
   - "Actually, my name is..."
   - "I prefer X, not Y"

3. **Be Explicit**:
   - "I'm interested in competitor analysis"
   - "I focus on Instagram marketing"

### **For Administrators**:

1. **Encourage Interaction**:
   - More chat = better learning
   - Encourage users to share preferences

2. **Monitor Learning**:
   - Check if AI is personalizing responses
   - Verify context is being saved

3. **Add Knowledge Sources**:
   - Company info + User learning = Best results
   - Competitor info + User interests = Strategic insights

---

## Testing the Learning System

### **Test 1: Basic Learning**
```
1. Chat: "My name is [Your Name]"
2. End conversation
3. Start new chat
4. Say: "Hello"
5. Expected: AI greets you by name
```

### **Test 2: Preference Learning**
```
1. Chat: "I prefer working on Instagram campaigns"
2. End conversation
3. Create a new task about "social media"
4. Expected: Task description mentions Instagram
```

### **Test 3: Correction**
```
1. Chat: "My name is John"
2. Chat: "Actually, call me Johnny"
3. End conversation
4. Start new chat
5. Expected: AI uses "Johnny"
```

---

## Summary

| Feature | Status | Company-Specific | User-Specific |
|---------|--------|------------------|---------------|
| **Chat Learning** | ✅ Active | ✅ Yes | ✅ Yes |
| **Task History Learning** | ✅ Active | ✅ Yes | ✅ Yes |
| **Domain Tracking** | ✅ Active | ✅ Yes | ✅ Yes |
| **Context Persistence** | ✅ Active | ✅ Yes | ✅ Yes |
| **Intelligent Updates** | ✅ Active | ✅ Yes | ✅ Yes |
| **Cross-Company Isolation** | ✅ Active | ✅ Yes | ✅ Yes |

---

## Answer to Your Question

**Q: Will my AI and task creation learn about the information has been fed to him by the user interacting with him in the company?**

**A: YES! ✅**

1. **ApliChat learns** from every conversation
2. **Task generation uses** learned context
3. **Learning is company-specific** - isolated per company
4. **Learning is user-specific** - personalized per user
5. **Context persists** across sessions
6. **AI gets smarter** with more interactions

The more users interact with the AI, the better it understands:
- Who they are
- What they do
- What they prefer
- What they're interested in
- How to help them better

---

**Date**: November 14, 2024  
**Status**: ✅ Fully Implemented and Active

