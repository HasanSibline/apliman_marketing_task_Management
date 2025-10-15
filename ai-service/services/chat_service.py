import logging
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from datetime import datetime
import json
import os

logger = logging.getLogger(__name__)

class ChatService:
    """Service for handling conversational AI chat with context and memory"""

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        # Use the same model as content generation (from config)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.model = genai.GenerativeModel(model_name)
        logger.info(f"✅ ChatService initialized with {model_name}")

    def process_chat_message(
        self,
        message: str,
        user_context: Dict[str, Any],
        user: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        knowledge_sources: List[Dict[str, Any]],
        additional_context: Dict[str, Any],
        is_deep_analysis: bool = False
    ) -> Dict[str, Any]:
        """
        Process a chat message and generate a response
        
        Args:
            message: The user's message
            user_context: Learned information about the user
            user: Current user details
            conversation_history: Recent conversation history
            knowledge_sources: Apliman and competitor knowledge sources
            additional_context: Task references and user mentions
            is_deep_analysis: Whether to provide detailed response
            
        Returns:
            Dict with message, contextUsed, and learnedContext
        """
        try:
            logger.info(f"Processing chat message: {message[:50]}...")
            
            # Build the system prompt with context
            system_prompt = self._build_system_prompt(
                user,
                user_context,
                knowledge_sources,
                additional_context,
                is_deep_analysis
            )

            # Build conversation history
            history_text = self._build_conversation_history(conversation_history)

            # Construct the full prompt
            full_prompt = f"""{system_prompt}

{history_text}

User: {message}
ApliChat:"""

            # Generate response
            response = self.model.generate_content(full_prompt)
            response_text = response.text.strip()

            # Extract learned context from the message
            learned_context = self._extract_learned_context(message, user_context)

            logger.info(f"✅ Generated chat response: {response_text[:100]}...")

            return {
                "message": response_text,
                "contextUsed": True,
                "learnedContext": learned_context
            }

        except Exception as e:
            logger.error(f"Error processing chat message: {e}")
            return {
                "message": "I'm having a bit of trouble understanding that. Could you rephrase?",
                "contextUsed": False,
                "learnedContext": None
            }

    def _build_system_prompt(
        self,
        user: Dict[str, Any],
        user_context: Dict[str, Any],
        knowledge_sources: List[Dict[str, Any]],
        additional_context: Dict[str, Any],
        is_deep_analysis: bool
    ) -> str:
        """Build the system prompt with all context"""
        
        response_style = "detailed and comprehensive" if is_deep_analysis else "concise and conversational"
        
        prompt = f"""You are ApliChat, a helpful and versatile AI assistant integrated into Apliman's task management system. 

Your capabilities:
- Answer general questions on any topic (technology, business, science, etc.)
- Provide specialized help with Apliman's task management system
- Access real-time information about tasks, users, and workflows
- Remember past conversations and user preferences
- Know about Apliman and its competitors

Your personality:
- Friendly, professional, and conversational
- Provide {response_style} responses
- Helpful for both general queries and domain-specific questions
- Natural and engaging, like chatting with a knowledgeable colleague

Current user: {user.get('name', 'User')} ({user.get('role', 'Unknown role')})
Position: {user.get('position', 'Not specified')}

"""

        # Add user context (memory from past conversations)
        if user_context and len(user_context) > 0:
            prompt += "\nWhat I remember about you:\n"
            for key, value in user_context.items():
                if key != 'lastUpdated' and value:
                    prompt += f"- {key}: {value}\n"

        # Add Apliman knowledge
        apliman_sources = [s for s in knowledge_sources if s.get('type') == 'APLIMAN']
        if apliman_sources:
            prompt += "\n=== About Apliman ===\n"
            for source in apliman_sources[:3]:  # Limit to top 3
                if source.get('content'):
                    content = source['content'][:2000]
                    prompt += f"\n{source.get('name', 'Source')}:\n{content}\n"
                elif source.get('description'):
                    prompt += f"\n{source.get('name', 'Source')}: {source.get('description')}\n"

        # Add competitor knowledge
        competitor_sources = [s for s in knowledge_sources if s.get('type') == 'COMPETITOR']
        if competitor_sources:
            prompt += "\n=== About Competitors ===\n"
            for source in competitor_sources[:2]:  # Limit to top 2
                if source.get('content'):
                    content = source['content'][:1500]
                    prompt += f"\n{source.get('name', 'Competitor')}:\n{content}\n"
                elif source.get('description'):
                    prompt += f"\n{source.get('name', 'Competitor')}: {source.get('description')}\n"

        # Add task references
        if additional_context.get('referencedTasks'):
            prompt += "\n=== Referenced Tasks ===\n"
            for task in additional_context['referencedTasks']:
                prompt += f"""
Task: {task['title']}
Status: {task.get('currentPhase', {}).get('name', 'Unknown')}
Priority: {task.get('priority', 'N/A')}
Assigned to: {task.get('assignedTo', {}).get('name', 'Unassigned')}
Due: {task.get('dueDate', 'No due date')}
Description: {task.get('description', 'No description')[:200]}
"""

        # Add mentioned users
        if additional_context.get('mentionedUsers'):
            prompt += "\n=== Mentioned Users ===\n"
            for u in additional_context['mentionedUsers']:
                task_count = len(u.get('assignedTasks', []))
                prompt += f"""
User: {u['name']} ({u.get('role', 'Unknown')})
Position: {u.get('position', 'Not specified')}
Active tasks: {task_count}
"""

        prompt += """

Instructions:
- Answer ANY question the user asks, whether it's general knowledge or system-specific
- Keep responses short and friendly unless asked for details
- For task management queries, use the context provided (tasks, users, knowledge sources)
- For general questions, use your broad knowledge base
- If you learn something new about the user (name, preferences, etc.), note it
- When discussing Apliman vs competitors, highlight Apliman's strengths naturally
- Be helpful, accurate, and engaging in all conversations

"""

        return prompt

    def _build_conversation_history(self, history: List[Dict[str, Any]]) -> str:
        """Build conversation history text"""
        if not history or len(history) <= 1:
            return ""

        history_text = "\n=== Recent Conversation ===\n"
        for msg in history[-10:]:  # Last 10 messages
            role = "You" if msg['role'] == 'user' else "ApliChat"
            content = msg['content'][:200]  # Truncate long messages
            history_text += f"{role}: {content}\n"

        return history_text

    def _extract_learned_context(self, message: str, existing_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract learned information from user message"""
        learned = {}
        message_lower = message.lower()

        # Extract name
        if "my name is" in message_lower or "i'm" in message_lower or "i am" in message_lower:
            # Simple name extraction (can be enhanced)
            words = message.split()
            for i, word in enumerate(words):
                if word.lower() in ['is', "i'm", 'am'] and i + 1 < len(words):
                    potential_name = words[i + 1].strip('.,!?')
                    if potential_name and len(potential_name) > 1 and potential_name[0].isupper():
                        learned['name'] = potential_name
                        break

        # Extract preferences
        if "i prefer" in message_lower or "i like" in message_lower:
            learned['preferences'] = message[:200]

        # Extract role/position info
        if "i work as" in message_lower or "i'm a" in message_lower:
            learned['work_info'] = message[:200]

        return learned if learned else None

