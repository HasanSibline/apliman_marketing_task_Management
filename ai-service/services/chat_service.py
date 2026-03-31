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
            self.model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            self.base_url = "https://api.groq.com/openai/v1"
        else:
            self.model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
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
        company_name: str = None,
        files: Optional[List[Dict[str, Any]]] = None,
        user_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a chat message and generate a response
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
                company_name,
                files is not None and len(files) > 0
            )

            # Build conversation history
            history_text = self._build_conversation_history(conversation_history)

            # Generate response via appropriate provider
            if self.provider == "groq":
                # For Groq, we still use a flattened prompt for now
                full_prompt = f"{system_prompt}\n\n{history_text}\n\nUser: {message}\nApliChat:"
                response_text = await self._generate_via_groq(full_prompt)
            else:
                # For Gemini, we use separate fields for better reliability
                response_text = await self._generate_via_rest(
                    message=message,
                    system_prompt=system_prompt,
                    history_text=history_text,
                    files=files, 
                    user_token=user_token
                )
                
            response_text = response_text.strip()

            # Use AI to intelligently extract and update context
            learned_context = None
            try:
                learned_context = await self.learning_service.extract_and_update_context(
                    message=message,
                    existing_context=user_context,
                    conversation_history=conversation_history,
                    user_info=user
                )
            except Exception as learn_err:
                logger.warning(f"⚠️ Context learning failed (likely rate limited): {learn_err}")
                learned_context = None

            logger.info(f"✅ Generated chat response using {self.provider}")
            if learned_context:
                logger.debug(f"✅ Learned new context")

            return {
                "message": response_text,
                "contextUsed": True,
                "learnedContext": learned_context
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error processing chat message: {error_msg}")
            
            # Determine if it's a quota issue to provide a better message
            detailed_msg = "I'm having a bit of trouble understanding that. Could you rephrase?"
            if "429" in error_msg:
                detailed_msg = "It looks like my AI quota just ran out. Please wait a minute and try again!"
            elif any(p in error_msg for p in ["Gemini", "Groq", "AI service"]):
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
                        raise Exception(f"Groq API failure ({response.status}): {error_text}")
        except Exception as e:
            logger.error(f"❌ Groq Chat request failed: {str(e)}")
            raise e

    async def _generate_via_rest(
        self, 
        message: str, 
        system_prompt: str,
        history_text: str,
        files: Optional[List[Dict[str, Any]]] = None, 
        user_token: Optional[str] = None
    ) -> str:
        """Make a request to Gemini API via REST with rotation and multimodal support"""
        attempts = 0
        last_error = None

        # --- Fetch file content from backend URLs and embed in prompt/parts ---
        file_parts = []
        file_context_text = ""

        if files:
            backend_base = os.getenv("BACKEND_URL") or os.getenv("API_URL", "").replace("/api", "") or "http://localhost:3001"
            backend_base = backend_base.rstrip('/')
            
            for f in files:
                url = f.get("url", "")
                name = f.get("name", "file")
                mime = f.get("type", "")

                if url and (url.startswith("/") or not url.startswith("http")):
                    url_prefix = "" if url.startswith("/") else "/"
                    url = f"{backend_base}{url_prefix}{url}"
                
                try:
                    headers = {}
                    if user_token:
                        headers['Authorization'] = user_token if user_token.startswith('Bearer ') else f'Bearer {user_token}'

                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as file_res:
                            if file_res.status == 200:
                                raw = await file_res.read()
                                
                                # Process binary vs text
                                if any(mime.startswith(t) for t in ["image/", "application/pdf"]) or name.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".pdf")):
                                    import base64
                                    # Fallback mime detection
                                    actual_mime = mime if mime else ("application/pdf" if name.lower().endswith(".pdf") else "image/jpeg")
                                    b64 = base64.b64encode(raw).decode("utf-8")
                                    file_parts.append({
                                        "inline_data": {
                                            "mime_type": actual_mime,
                                            "data": b64
                                        }
                                    })
                                    logger.info(f"✅ Successfully attached binary file: {name}")
                                
                                elif any(ext in name.lower() for ext in [".txt", ".md", ".csv", ".json", ".xml", ".html", ".js", ".ts", ".py", ".go", ".c", ".cpp", ".java"]):
                                    text = raw.decode("utf-8", errors="replace")
                                    file_context_text += f"\n--- Content of '{name}' ---\n{text[:10000]}\n---\n"
                                    logger.info(f"✅ Successfully read text file: {name}")
                                
                                elif name.lower().endswith((".docx", ".doc")):
                                    # Very basic fallback for docx if library missing: just mention it
                                    file_context_text += f"\n[File '{name}' is a Word document. Analysis limited to title for now.]\n"
                    
                except Exception as file_err:
                    logger.error(f"❌ Failed to fetch file {name}: {file_err}")

        if file_context_text:
            message = f"{message}\n\n=== ATTACHED FILE CONTENT ===\n{file_context_text}\n=== END OF ATTACHED FILES ==="
        max_attempts = max(len(self.api_keys), 3)

        while attempts < max_attempts:
            current_key = self.api_key
            url = f"{self.base_url}/models/{self.model_name}:generateContent"
            
            payload = {
                "system_instruction": {
                    "parts": [{"text": system_prompt}]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": f"Recent Conversation Context:\n{history_text}\n\nUser Message: {message}"}
                        ] + file_parts
                    }
                ],
                "generationConfig": {
                    "temperature": 0.5,
                    "maxOutputTokens": 4096,
                    "topP": 0.95,
                    "topK": 40
                }
            }

            # Try query and header auth
            for auth_method in ["query", "header"]:
                auth_url = f"{url}?key={current_key}" if auth_method == "query" else url
                try:
                    async with aiohttp.ClientSession() as session:
                        request_headers = {'Content-Type': 'application/json'}
                        if auth_method == "header":
                            request_headers['X-goog-api-key'] = current_key

                        async with session.post(auth_url, headers=request_headers, json=payload, timeout=aiohttp.ClientTimeout(total=45)) as response:
                            if response.status == 200:
                                data = await response.json()
                                if data.get('candidates') and data['candidates'][0].get('content'):
                                    return data['candidates'][0]['content']['parts'][0]['text']
                            
                            error_text = await response.text()
                            
                            # Handle 429 specifically with backoff
                            if response.status == 429:
                                wait_time = 2 ** (attempts + 1)
                                logger.warning(f"⚠️ Rate limited (429). Attempt {attempts + 1}/{max_attempts}. Waiting {wait_time}s...")
                                await asyncio.sleep(wait_time)
                                break # Break auth_method loop to retry with potentially rotated key (or same key after sleep)
                                
                            logger.warning(f"⚠️ {auth_method} auth failed ({response.status}): {error_text[:200]}")
                            last_error = error_text
                except Exception as e:
                    last_error = str(e)
                    continue
            
            # Rotate key or just increment attempt if we only have one key
            attempts += 1
            if not self._rotate_api_key() and attempts < max_attempts:
                # If we have only one key, we still want to retry after the sleep
                logger.debug(f"Retrying with the same key (attempt {attempts+1})")
                continue

        raise Exception(f"AI generation failed after {attempts} attempts: {last_error}")


    def _build_system_prompt(
        self,
        user: Dict[str, Any],
        user_context: Dict[str, Any],
        knowledge_sources: List[Dict[str, Any]],
        additional_context: Dict[str, Any],
        is_deep_analysis: bool,
        company_name: str = None,
        has_files: bool = False
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
Department: {user.get('department', {}).get('name', 'Not assigned')}

=== ENTERPRISE CAPABILITIES ===
- You are aware of the company hierarchy and departments.
- You can reference tasks using TSK-XXXX numbers and tickets using TKT-XXXX numbers.
- If a user mentions a code like TKT-1001, they are referring to a specific ticket.
- You can analyze files and images if they are provided in the chat.
{"- (IMAGE ANALYST MODE: ACTIVE) The user has attached files/images. Analyze them carefully to answer their query." if has_files else ""}

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

        # Add task and ticket references
        if additional_context.get('referencedTasks'):
            prompt += "\n=== Specifically Referenced Tasks ===\n"
            for task in additional_context['referencedTasks']:
                prompt += f"""
Task: {task['title']} (TSK-{task.get('taskNumber', 'N/A')})
Status: {task.get('currentPhase', {}).get('name', 'Unknown')}
Priority: {task.get('priority', 'N/A')}
Due: {task.get('dueDate', 'No due date')}
"""

        if additional_context.get('referencedTickets'):
            prompt += "\n=== Specifically Referenced Tickets ===\n"
            for ticket in additional_context['referencedTickets']:
                prompt += f"""
Ticket: {ticket['title']} ({ticket.get('ticketNumber', 'N/A')})
Status: {ticket.get('status', 'Unknown')}
Priority: {ticket.get('priority', 'N/A')}
Requester: {ticket.get('requester', {}).get('name', 'Unknown')}
Logistical Target: {ticket.get('receiverDept', {}).get('name', 'Unknown')}
Assignee: {ticket.get('assignee', {}).get('name', 'Unassigned')}
Description: {ticket.get('description', 'No description')}
"""
        
        # Give AI the user's workload context natively
        if additional_context.get('userAnalytics'):
            analytics = additional_context['userAnalytics']
            prompt += f"\n=== Current User Statistics ===\n"
            prompt += f"- Total Active Tasks: {analytics.get('activeTaskCount', 0)}\n"
            prompt += f"- Total Completed Tasks: {analytics.get('completedTaskCount', 0)}\n"

        if additional_context.get('userActiveTasks'):
            prompt += "\n=== User's Active Tasks ===\n"
            for task in additional_context['userActiveTasks']:
                phase_name = task.get('currentPhase', {}).get('name', 'Unknown') if task.get('currentPhase') else 'Unknown'
                prompt += f"- Task: {task.get('title', 'Untitled')} | Phase: {phase_name} | Priority: {task.get('priority', 'N/A')} | Due: {task.get('dueDate', 'No due date')}\n"

        if additional_context.get('companyObjectives'):
            prompt += "\n=== Active Company Objectives ===\n"
            for obj in additional_context['companyObjectives']:
                prompt += f"- Objective: {obj.get('title')} | Status: {obj.get('status')}\n"

        if additional_context.get('companyQuarters'):
            prompt += "\n=== Active/Upcoming Quarters ===\n"
            for q in additional_context['companyQuarters']:
                prompt += f"- Quarter: {q.get('name')} {q.get('year')} | Status: {q.get('status')} | Period: {q.get('startDate')} to {q.get('endDate')}\n"

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

