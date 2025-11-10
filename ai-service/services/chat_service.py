import logging
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from datetime import datetime
import json
import os
from .context_learning import ContextLearningService

logger = logging.getLogger(__name__)

class ChatService:
    """Service for handling conversational AI chat with context and memory"""

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        # Use the same model as content generation (from config)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.model = genai.GenerativeModel(model_name)
        self.learning_service = ContextLearningService(api_key, model_name)
        logger.info(f"✅ ChatService initialized with {model_name}")

    def process_chat_message(
        self,
        message: str,
        user_context: Dict[str, Any],
        user: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        knowledge_sources: List[Dict[str, Any]],
        additional_context: Dict[str, Any],
        is_deep_analysis: bool = False,
        company_name: str = None  # Add company_name parameter
    ) -> Dict[str, Any]:
        """
        Process a chat message and generate a response
        
        Args:
            message: The user's message
            user_context: Learned information about the user
            user: Current user details
            conversation_history: Recent conversation history
            knowledge_sources: Company and competitor knowledge sources
            additional_context: Task references and user mentions
            is_deep_analysis: Whether to provide detailed response
            company_name: Company name for personalized responses
            
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
                is_deep_analysis,
                company_name  # Pass company name
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

            # Use AI to intelligently extract and update context
            learned_context = self.learning_service.extract_and_update_context(
                message=message,
                existing_context=user_context,
                conversation_history=conversation_history,
                user_info=user
            )

            logger.info(f"✅ Generated chat response: {response_text[:100]}...")
            if learned_context:
                logger.info(f"✅ Learned new context: {learned_context}")

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
        is_deep_analysis: bool,
        company_name: str = None  # Add company_name parameter
    ) -> str:
        """Build the system prompt with all context"""
        
        response_style = "detailed and comprehensive" if is_deep_analysis else "concise and conversational"
        
        # Use provided company name, or extract from knowledge sources, or use generic fallback
        if not company_name:
            company_name = "the company"
            if knowledge_sources:
                company_sources = [s for s in knowledge_sources if s.get('type') == 'COMPANY']
                if company_sources and company_sources[0].get('name'):
                    company_name = company_sources[0].get('name').replace(' - ', '').replace('About ', '')
        
        prompt = f"""You are ApliChat, a helpful and versatile AI assistant integrated into {company_name}'s task management system. 

Your capabilities:
- Answer general questions on any topic (technology, business, science, etc.)
- Provide specialized help with {company_name}'s task management system
- Access real-time information about tasks, users, and workflows
- Remember past conversations and user preferences
- Know about {company_name} and its competitors

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

        # Add company knowledge (COMPANY type only)
        company_sources = [s for s in knowledge_sources if s.get('type') == 'COMPANY']
        if company_sources:
            prompt += f"\n=== About {company_name} ===\n"
            for source in company_sources[:3]:  # Limit to top 3
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

        prompt += f"""

Instructions:
- Answer ANY question the user asks, whether it's general knowledge or system-specific
- Keep responses short and friendly unless asked for details
- For task management queries, use the context provided (tasks, users, knowledge sources)
- For general questions, use your broad knowledge base
- If you learn something new about the user (name, preferences, etc.), note it
- When discussing {company_name} vs competitors, highlight {company_name}'s strengths naturally
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

    def learn_from_task_history(
        self,
        user_context: Dict[str, Any],
        completed_tasks: List[Dict[str, Any]],
        active_tasks: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Learn from user's task history to understand their work patterns
        
        Args:
            user_context: Existing user context
            completed_tasks: Recently completed tasks
            active_tasks: Currently active tasks
            
        Returns:
            Learned context from tasks
        """
        try:
            return self.learning_service.learn_from_tasks(
                completed_tasks=completed_tasks,
                active_tasks=active_tasks,
                existing_context=user_context
            )
        except Exception as e:
            logger.error(f"Error learning from task history: {e}")
            return None
    
    def learn_about_domain_interests(
        self,
        domain_topic: str,
        user_questions: List[str],
        existing_knowledge: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Learn what user wants to know about specific domains
        
        Args:
            domain_topic: Domain name (e.g., "company", "competitors")
            user_questions: Questions user asked about this domain
            existing_knowledge: Current knowledge about user's interests
            
        Returns:
            Updated knowledge about user's domain interests
        """
        try:
            return self.learning_service.learn_about_domain(
                domain_topic=domain_topic,
                user_questions=user_questions,
                existing_knowledge=existing_knowledge
            )
        except Exception as e:
            logger.error(f"Error learning domain interests: {e}")
            return None

