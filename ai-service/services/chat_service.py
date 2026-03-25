import logging
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from datetime import datetime
import json
import os
import aiohttp
import asyncio
from .context_learning import ContextLearningService

logger = logging.getLogger(__name__)

class ChatService:
    """Service for handling conversational AI chat with context and memory"""

    def __init__(self, api_keys: List[str], provider: str = "gemini"):
        self.api_keys = api_keys if isinstance(api_keys, list) else [api_keys]
        self.current_key_index = 0
        self.api_key = self.api_keys[0] # For backwards compatibility with internal services
        self.provider = provider.lower()
        
        # Use the same model as content generation (from config)
        if self.provider == "groq":
            self.model_name = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")
            self.base_url = "https://api.groq.com/openai/v1"
        else:
            self.model_name = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
            self.base_url = "https://generativelanguage.googleapis.com/v1beta"
            
        self.learning_service = ContextLearningService(self.api_key, self.model_name)
        logger.info(f"✅ ChatService initialized with {self.provider} ({self.model_name}) and {len(self.api_keys)} API keys")

    def _rotate_api_key(self):
        """Rotate to the next API key"""
        if len(self.api_keys) > 1:
            old_index = self.current_key_index
            self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
            self.api_key = self.api_keys[self.current_key_index]
            # Update learning service with new key
            self.learning_service.api_key = self.api_key
            logger.warning(f"🔄 Rotating Chat API key from index {old_index} to {self.current_key_index}")
            return True
        return False

    async def process_chat_message(
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

            # Generate response via appropriate provider
            if self.provider == "groq":
                response_text = await self._generate_via_groq(full_prompt)
            else:
                response_text = await self._generate_via_rest(full_prompt)
                
            response_text = response_text.strip()

            # Use AI to intelligently extract and update context
            learned_context = await self.learning_service.extract_and_update_context(
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
            error_msg = str(e)
            logger.error(f"Error processing chat message: {error_msg}")
            
            # If it's a known AI error, pass it back so the user knows what's wrong
            detailed_msg = "I'm having a bit of trouble understanding that. Could you rephrase?"
            if any(p in error_msg for p in ["Gemini", "Groq", "AI service"]):
                detailed_msg = f"AI service error: {error_msg}. Please check your AI API key and provider settings."
            elif "API key was reported as leaked" in error_msg:
                detailed_msg = "Your AI API key has been revoked by the provider. Please update your company settings with a new key."
            
            return {
                "message": detailed_msg,
                "contextUsed": False,
                "learnedContext": None
            }

    async def _generate_via_groq(self, prompt: str) -> str:
        """Make a request to Groq API (OpenAI compatible)"""
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "max_tokens": 2048,
            "stream": False
        }
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}'
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data['choices'][0]['message']['content']
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Groq Chat API error ({response.status}): {error_text}")
                        # Fallback to Gemini if Groq fails
                        logger.info("🔄 Falling back to Gemini for chat...")
                        return await self._generate_via_rest(prompt)
        except Exception as e:
            logger.error(f"❌ Groq Chat request failed: {str(e)}")
            # Fallback to Gemini
            logger.info("🔄 Falling back to Gemini for chat...")
            return await self._generate_via_rest(prompt)

    async def _generate_via_rest(self, prompt: str) -> str:
        """Make a stateless request to Gemini API via REST with rotation support"""
        attempts = 0
        max_attempts = len(self.api_keys)
        last_error = None
        
        while attempts < max_attempts:
            current_key = self.api_key
            url_query = f"{self.base_url}/models/{self.model_name}:generateContent?key={current_key}"
            url_header = f"{self.base_url}/models/{self.model_name}:generateContent"
            
            headers = {
                'Content-Type': 'application/json',
                'X-goog-api-key': current_key
            }
            payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            
            try:
                # Try both Query Param and Header Auth (loop over auth methods)
                for auth_method, url in [("query", url_query), ("header", url_header)]:
                    try:
                        async with aiohttp.ClientSession() as session:
                            request_headers = {'Content-Type': 'application/json'}
                            if auth_method == "header":
                                request_headers['X-goog-api-key'] = current_key
                                
                            async with session.post(url, headers=request_headers, json=payload, timeout=aiohttp.ClientTimeout(total=45)) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    if data.get('candidates') and data['candidates'][0].get('content'):
                                        return data['candidates'][0]['content']['parts'][0]['text']
                                    else:
                                        msg = "AI returned an empty response (likely blocked by safety filters)."
                                        logger.warning(f"⚠️ {msg}")
                                        raise Exception(msg)
                                
                                error_text = await response.text()
                                try:
                                    error_json = json.loads(error_text)
                                    error_msg = error_json.get('error', {}).get('message', error_text)
                                except:
                                    error_msg = error_text
                                
                                # CRITICAL: Rotate on key errors or quota exceed
                                is_key_error = any(m in error_msg.lower() for m in ["api key expired", "invalid api key", "key not found", "api_key_invalid"])
                                is_quota_error = response.status == 429
                                
                                if is_key_error or is_quota_error:
                                    logger.warning(f"❌ Chat API key {self.current_key_index} error ({response.status}): {error_msg}")
                                    if self._rotate_api_key():
                                        # Key was rotated, break out of auth_method loop and retry while loop
                                        raise StopIteration("rotate")
                                    else:
                                        raise Exception(f"All API keys exhausted: {error_msg}")
                                
                                # If just one auth method failed but not key error, try next auth method
                                if auth_method == "query":
                                    logger.warning(f"Query auth failed ({response.status}), trying header auth...")
                                    continue
                                else:
                                    raise Exception(f"Gemini API failure ({response.status}): {error_msg}")
                                    
                    except StopIteration:
                        # Signal to retry with new key
                        break
                    except Exception as e:
                        if auth_method == "query":
                            continue # Try header auth
                        last_error = str(e)
                        raise e
                else:
                    # If we finished auth_method loop without success/rotation
                    attempts += 1
                    continue
                
                # If we broke out of auth_method loop via StopIteration
                attempts += 1
                continue
                
            except Exception as e:
                last_error = str(e)
                attempts += 1
                logger.warning(f"Attempt {attempts} failed: {last_error}")
                if not self._rotate_api_key():
                    break
                    
        raise Exception(last_error or "All AI generation attempts failed")

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
                company_sources = [s for s in knowledge_sources if s.get('type') in ['COMPANY', 'OWN_COMPANY']]
                if company_sources and company_sources[0].get('name'):
                    company_name = company_sources[0].get('name').replace(' - ', '').replace('About ', '')
        
        prompt = f"""You are ApliChat, a helpful and versatile AI assistant for {company_name}. 

IMPORTANT: When users ask about "{company_name}" or "our company" or "this company", they are asking about {company_name} THE BUSINESS/ORGANIZATION, NOT about the task management platform they're using. Use the knowledge sources provided below to answer questions about {company_name}'s actual business, services, products, and operations.

Your capabilities:
- Answer questions about {company_name}'s business, services, and operations (use knowledge sources below)
- Answer general questions on any topic (technology, business, science, etc.)
- Help with task management features (creating tasks, tracking progress, etc.)
- Access real-time information about tasks, users, and workflows
- Remember past conversations and user preferences
- Know about {company_name}'s competitors

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

        # Add company knowledge (COMPANY or OWN_COMPANY type)
        company_sources = [s for s in knowledge_sources if s.get('type') in ['COMPANY', 'OWN_COMPANY']]
        has_company_content = False
        
        if company_sources:
            prompt += f"\n=== About {company_name} ===\n"
            for source in company_sources[:3]:  # Limit to top 3
                if source.get('content'):
                    content = source['content'][:2000]
                    prompt += f"\n{source.get('name', 'Source')}:\n{content}\n"
                    has_company_content = True
                elif source.get('description'):
                    prompt += f"\n{source.get('name', 'Source')}: {source.get('description')}\n"
                    has_company_content = True
        
        # Warn if no company knowledge available
        if not has_company_content:
            prompt += f"\n⚠️ WARNING: No knowledge sources with content available for {company_name}. If asked about {company_name}, you MUST say you don't have information yet.\n"

        # Add competitor knowledge with competitive analysis instructions
        competitor_sources = [s for s in knowledge_sources if s.get('type') == 'COMPETITOR']
        has_competitor_content = False
        
        if competitor_sources:
            prompt += "\n=== COMPETITIVE INTELLIGENCE ===\n"
            prompt += f"Use this information to help {company_name} compete effectively:\n\n"
            
            for source in competitor_sources[:2]:  # Limit to top 2
                if source.get('content'):
                    content = source['content'][:1500]
                    prompt += f"\n{source.get('name', 'Competitor')}:\n{content}\n"
                    has_competitor_content = True
                elif source.get('description'):
                    prompt += f"\n{source.get('name', 'Competitor')}: {source.get('description')}\n"
                    has_competitor_content = True
            
            if has_competitor_content:
                prompt += f"""
COMPETITIVE STRATEGY GUIDELINES:
- When discussing competitors, identify {company_name}'s unique advantages and differentiators
- Suggest ways {company_name} can improve based on competitor strengths
- Highlight gaps in competitor offerings that {company_name} can exploit
- Recommend strategies to position {company_name} ahead of competitors
- Focus on value propositions that set {company_name} apart
- Never directly attack or disparage competitors - focus on {company_name}'s strengths
"""

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

CRITICAL INSTRUCTIONS - FOLLOW STRICTLY:

1. KNOWLEDGE SOURCE PRIORITY:
   - When asked about "{company_name}", ONLY use information from the knowledge sources above
   - If knowledge sources have NO content about {company_name}, say: "I don't have detailed information about {company_name} yet. Please ask your administrator to add knowledge sources."
   - NEVER make up or invent information about {company_name}
   - NEVER guess what {company_name} does or what services they offer

2. COMPANY VS PLATFORM:
   - {company_name} is a BUSINESS/ORGANIZATION (use knowledge sources)
   - The task management platform is just a TOOL they're using
   - Don't confuse the two

3. GENERAL KNOWLEDGE:
   - For general questions (weather, facts, etc.), use your knowledge but be honest about limitations
   - If you cannot access real-time information, say so clearly
   - Don't pretend to search online if you can't

4. RESPONSE RULES:
   - Keep responses short and friendly unless asked for details
   - If you don't know something, say "I don't know" or "I don't have that information"
   - Never hallucinate or make up plausible-sounding but false information
   - When discussing competitors, only use information from competitor knowledge sources

5. TASK MANAGEMENT HELP:
   - For platform questions (e.g., "how do I create a task"), provide helpful guidance
   - Use task references and user mentions when available

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

    async def learn_from_task_history(
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
            return await self.learning_service.learn_from_tasks(
                completed_tasks=completed_tasks,
                active_tasks=active_tasks,
                existing_context=user_context
            )
        except Exception as e:
            logger.error(f"Error learning from task history: {e}")
            return None
    
    async def learn_about_domain_interests(
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
            return await self.learning_service.learn_about_domain(
                domain_topic=domain_topic,
                user_questions=user_questions,
                existing_knowledge=existing_knowledge
            )
        except Exception as e:
            logger.error(f"Error learning domain interests: {e}")
            return None

