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
            if self.provider == "groq" and not (files and len(files) > 0):
                # For Groq, we still use a flattened prompt for now
                full_prompt = f"{system_prompt}\n\n{history_text}\n\nUser: {message}\nApliChat:"
                response_text = await self._generate_via_groq(full_prompt)
            else:
                # Fallback mechanism: Groq lacks native multimodal vision endpoints.
                # If files are present and provider is Groq, forcibly trigger Gemini fallback.
                if self.provider == "groq" and files and len(files) > 0:
                    logger.warning("Files attached! Groq lacks vision. Falling back to Gemini.")
                    self.model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
                    self.base_url = "https://generativelanguage.googleapis.com/v1beta"
                    
                    from config import get_config
                    fallback_keys = get_config().get_api_keys()
                    if fallback_keys:
                        self.api_key = fallback_keys[0]
                        self.api_keys = fallback_keys

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
    async def _generate_via_rest(
        self, 
        message: str, 
        system_prompt: str,
        history_text: str,
        files: Optional[List[Dict[str, Any]]] = None, 
        user_token: Optional[str] = None
    ) -> str:
        """Make a request to Gemini API via REST with multi-modal parts"""
        attempts = 0
        last_error = None

        # --- Multimodal Support: Fetch assets and binary content ---
        media_parts = []
        text_content_parts = []
        file_count = 0

        if files:
            # Prefer absolute URLs sent by backend; fallback to robust local/remote guessing
            backend_base = os.getenv("BACKEND_URL", "").rstrip('/')
            
            for f in files:
                url = f.get("url", "")
                name = f.get("name", "file")
                mime = f.get("type", "")

                # --- STEP 1: PREFER EMBEDDED BASE64 (Eliminates Fetch Failures) ---
                embedded_b64 = f.get("base64")
                if embedded_b64:
                    logger.info(f"🚀 MULTIMODAL: Using embedded Base64 for {name}")
                    file_count += 1
                    
                    is_image = any(mime.startswith(t) for t in ["image/"]) or name.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
                    if is_image or name.lower().endswith(".pdf"):
                        actual_mime = mime if mime else ("application/pdf" if name.lower().endswith(".pdf") else "image/jpeg")
                        media_parts.append({
                            "inlineData": {
                                "mimeType": actual_mime,
                                "data": embedded_b64
                            }
                        })
                        logger.info(f"🖼️ Attached visual/binary part via Base64: {name}")
                    else:
                        # Extract text from Base64 if possible
                        try:
                            import base64 as b64_lib
                            decoded = b64_lib.b64decode(embedded_b64)
                            if name.lower().endswith((".docx", ".doc")):
                                from docx import Document
                                import io
                                doc = Document(io.BytesIO(decoded))
                                text = "\n".join([para.text for para in doc.paragraphs])
                                text_content_parts.append({"text": f"[Attached Word Document '{name}']: {text[:15000]}"})
                            else:
                                text = decoded.decode("utf-8", errors="replace")
                                text_content_parts.append({"text": f"[Attached File '{name}']: {text[:15000]}"})
                            logger.info(f"📄 Attached textual part via Base64: {name}")
                        except Exception as e:
                            logger.error(f"❌ Base64 decode error for {name}: {str(e)}")
                    continue # Skip fetching if we already have the data

                # --- STEP 2: FALLBACK TO URL FETCHING ---
                # Normalize URL for fetching
                full_url = url
                if not (url.startswith("http://") or url.startswith("https://")):
                    if backend_base:
                        url_sep = "" if url.startswith("/") else "/"
                        full_url = f"{backend_base}{url_sep}{url}"
                    else:
                        full_url = f"http://localhost:3001/{url.lstrip('/')}"
                
                try:
                    logger.info(f"✨ MULTIMODAL FETCH: Trying {name} from {full_url}")
                    headers = {}
                    if user_token:
                        headers['Authorization'] = user_token if user_token.startswith('Bearer ') else f'Bearer {user_token}'

                    async with aiohttp.ClientSession() as session:
                        async with session.get(full_url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as file_res:
                            if file_res.status == 200:
                                raw = await file_res.read()
                                logger.info(f"✅ Downloaded {name} ({len(raw)} bytes)")
                                file_count += 1
                                
                                # 1. Binary Parts (Gemini Inline Data)
                                is_image = any(mime.startswith(t) for t in ["image/"]) or name.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
                                if is_image or name.lower().endswith(".pdf"):
                                    import base64
                                    actual_mime = mime if mime else ("application/pdf" if name.lower().endswith(".pdf") else "image/jpeg")
                                    b64 = base64.b64encode(raw).decode("utf-8")
                                    media_parts.append({
                                        "inlineData": {
                                            "mimeType": actual_mime,
                                            "data": b64
                                        }
                                    })
                                    logger.info(f"🖼️ Attached visual/binary part: {name}")
                                
                                # 2. Text Parts (Extracted content)
                                else:
                                    content = None
                                    if name.lower().endswith((".docx", ".doc")):
                                        try:
                                            from docx import Document
                                            import io
                                            doc = Document(io.BytesIO(raw))
                                            text = "\n".join([para.text for para in doc.paragraphs])
                                            content = f"[Attached Word Document '{name}']:\n{text[:15000]}"
                                        except Exception as e:
                                            content = f"[Error reading Word Doc '{name}': {str(e)}]"
                                    else:
                                        # Plain text, CSV, JSON, MD, etc.
                                        try:
                                            text = raw.decode("utf-8", errors="replace")
                                            content = f"[Attached File '{name}']:\n{text[:15000]}"
                                        except:
                                            content = f"[Attached Binary File '{name}' - Length: {len(raw)} bytes]"
                                    
                                    if content:
                                        text_content_parts.append({"text": content})
                                        logger.info(f"📄 Attached textual part: {name}")
                            else:
                                logger.error(f"❌ FETCH FAILED (Status {file_res.status}) for {full_url}")
                                text_content_parts.append({"text": f"(System Error: Could not retrieve file '{name}' for analysis. Status {file_res.status})"})
                except Exception as e:
                    logger.error(f"❌ MULTIMODAL EXCEPTION ({name}): {str(e)}")
                    text_content_parts.append({"text": f"(System Error: Failed to fetch file '{name}')"})

        # Final Prompt Construction: ATTACHMENTS FIRST, THEN RECENT HISTORY, THEN MESSAGE
        # This reordering is proven more effective for Gemini 1.5 context prioritization
        user_message_text = message if (message and message.strip()) else "(Analyzing attached assets...)"
        
        # Build prioritized parts list
        parts = []
        
        if media_parts:
            parts.extend(media_parts)
            logger.info(f"⚡ Vision: Attached {len(media_parts)} binary/media parts to prompt.")
            
        if text_content_parts:
            parts.extend(text_content_parts)
            logger.info(f"⚡ Documents: Attached {len(text_content_parts)} text/doc parts to prompt.")
            
        parts.append({
            "text": f"IMPORTANT: ANALYZE THE ABOVE ASSETS FIRST.\n\nRecent History:\n{history_text}\n\nUser Message: {user_message_text}"
        })

        if file_count > 0:
            parts.append({"text": f"\n[SYSTEM NOTICE: Task-specific analysis mode is ACTIVE for the {file_count} file(s) above. If the user asks about these files, ignore generic company knowledge and focus on the file content.]"})

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
                        "parts": parts
                    }
                ],
                "generationConfig": {
                    "temperature": 0.3, # Lower temperature for factual analysis from files
                    "maxOutputTokens": 4096,
                    "topP": 0.8,
                }
            }

            for auth_method in ["query", "header"]:
                auth_url = f"{url}?key={current_key}" if auth_method == "query" else url
                try:
                    async with aiohttp.ClientSession() as session:
                        headers = {'Content-Type': 'application/json'}
                        if auth_method == "header":
                            headers['X-goog-api-key'] = current_key

                        async with session.post(auth_url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=50)) as response:
                            if response.status == 200:
                                data = await response.json()
                                if data.get('candidates') and data['candidates'][0].get('content'):
                                    return data['candidates'][0]['content']['parts'][0]['text']
                            
                            error_text = await response.text()
                            if response.status == 429:
                                logger.warning(f"Rate limited (429). Attempt {attempts+1}. Roating keys...")
                                break
                                
                            logger.warning(f"API Attempt failed ({response.status}): {error_text[:250]}")
                            last_error = error_text
                except Exception as e:
                    last_error = str(e)
                    continue
            
            attempts += 1
            if not self._rotate_api_key() and attempts < max_attempts:
                await asyncio.sleep(1)
                continue

        raise Exception(f"AI Multimodal analysis failed: {last_error}")


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
        """Build the system prompt with vision identity preservation"""
        
        response_style = "comprehensive" if is_deep_analysis else "conversational"
        company_name = company_name or "the company"
        
        prompt = f"""You are ApliChat, a state-of-the-art MULTIMODAL AI assistant for {company_name}. 

IMPORTANT IDENTITY GUIDELINES:
- You are a VISION-CAPABLE model (Gemini 1.5 Flash). 
- If files or images are attached, you CAN see and analyze them perfectly.
- NEVER say "I am a text-based model" or "I cannot see images". If a file is attached, analyze it!
- If a file is attached, it takes ABSOLUTE PRIORITY over other context.

Your capabilities:
- Multimodal analysis of images, PDFs, and documents
- Answering questions about {company_name}'s business and operations
- Task and lifecycle management assistance
- Deep analytical reasoning

Current User Context:
- Name: {user.get('name', 'Analyst')}
- Role: {user.get('role', 'User')}
- Department: {user.get('department', {}).get('name', 'N/A')}

=== ANALYST MODE ===
{"[MODE: ACTIVE] Multiple files/images have been attached to this message. Review them immediately." if has_files else "[MODE: STANDARD] No new files attached."}

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
Ticket: {ticket.get('title', 'Untitled')} ({ticket.get('ticketNumber', 'N/A')})
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

