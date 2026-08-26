import logging
from typing import Dict, Any, Optional, Tuple
import os
from dotenv import load_dotenv
import asyncio
from datetime import datetime
import aiohttp
import json
from config import get_config

logger = logging.getLogger(__name__)

class ContentGeneratorError(Exception):
    """Custom exception for ContentGenerator errors"""
    pass


# Every provider names its two token counts differently, and the backend prices from
# exactly one pair of names. Both helpers live here rather than in each provider path
# so the "no zeros" rule below is stated once. chat_service imports them for the same
# reason.
Usage = Optional[Dict[str, int]]


def normalise_usage(input_tokens: Any, output_tokens: Any) -> Usage:
    """Rename one provider's token counts to the pair the backend reads.

    Returns None when the provider told us nothing usable. The backend rejects an
    all-zero report as "not a measurement" and falls back to its own estimate, so
    saying nothing is better than saying zero: zero would price a real call at $0.
    """
    try:
        counted_in = int(input_tokens or 0)
        counted_out = int(output_tokens or 0)
    except (TypeError, ValueError):
        return None

    if counted_in <= 0 and counted_out <= 0:
        return None

    return {"input_tokens": max(counted_in, 0), "output_tokens": max(counted_out, 0)}


def add_usage(total: Usage, addition: Usage) -> Usage:
    """Add one call's tokens to a running total for the current HTTP response.

    The gateway records one usage row per response, not per upstream call, so an
    endpoint that talks to the provider three times has to report the sum or the cost
    it stores will only cover part of what was spent.
    """
    if not addition:
        return total
    if not total:
        return dict(addition)

    return {
        "input_tokens": total["input_tokens"] + addition["input_tokens"],
        "output_tokens": total["output_tokens"] + addition["output_tokens"],
    }

class ContentGenerator:
    def __init__(self, api_key: Optional[str] = None, provider: str = "gemini", model: Optional[str] = None):
        self.config = get_config()
        self.last_request_time = None
        self.request_interval = 1.0  # Minimum time between requests in seconds
        self.knowledge_sources = None  # Store knowledge sources for enhanced prompts
        self.company_name = None  # Store company name for personalized responses
        self.provided_api_key = api_key  # Store the provided API key
        self.provider = provider.lower()
        self.model_override = model  # Set by the platform key, if it pins a model
        # Tokens spent by every provider call this instance has made. One instance is
        # built per HTTP request, so this total is exactly what that response covers.
        self.token_usage: Usage = None

        if self.provider == "anthropic":
            self._initialize_anthropic()
        elif self.provider == "groq":
            self._initialize_groq()
        elif self.provider == "openai":
            self._initialize_openai()
        else:
            self._initialize_gemini()

    def _initialize_anthropic(self):
        """Initialize Claude using the company or platform-provided API key."""
        self.api_key = self.provided_api_key or None
        if not self.api_key:
            logger.warning("Anthropic initialized WITHOUT a key: AI calls will be rejected until one is provided")

        self.base_url = "https://api.anthropic.com/v1"
        self.model = self.model_override or self.config.ANTHROPIC_MODEL
        self.api_type = "anthropic"
        logger.info(f"✅ Anthropic initialized with model {self.model}")

        
    def _initialize_gemini(self):
        """Initialize Gemini using ONLY the company-provided API key (no env fallback)."""
        try:
            # The company-specific key is the ONLY key ever used.
            self.api_keys = [self.provided_api_key] if self.provided_api_key else []
            if self.api_keys:
                logger.info("✅ Gemini initialized with company-provided API key")
            else:
                # No key at construction time (e.g. health check). Do not crash;
                # request-time calls will raise a clear error instead.
                logger.warning("Gemini initialized WITHOUT a company key: AI calls will be rejected until a key is provided")

            self.current_key_index = 0  # Track which key we're using
            self.base_url = "https://generativelanguage.googleapis.com/v1beta"
            self.model = self.config.GEMINI_MODEL
            self.api_type = "gemini"

        except Exception as e:
            if not isinstance(e, ContentGeneratorError):
                raise ContentGeneratorError(f"Failed to initialize Gemini: {str(e)}")
            raise

    def _initialize_groq(self):
        """Initialize Groq using ONLY the company-provided API key (no env fallback)."""
        try:
            self.api_key = self.provided_api_key or None
            if not self.api_key:
                logger.warning("Groq initialized WITHOUT a company key: AI calls will be rejected until a key is provided")

            self.base_url = "https://api.groq.com/openai/v1"
            self.model = self.config.GROQ_MODEL
            self.api_type = "groq"
            logger.info(f"✅ Groq initialized with model {self.model}")

        except Exception as e:
            raise ContentGeneratorError(f"Failed to initialize Groq: {str(e)}")

    def _initialize_openai(self):
        """Initialize OpenAI using ONLY the company-provided API key (no env fallback)."""
        try:
            self.api_key = self.provided_api_key or None
            if not self.api_key:
                logger.warning("OpenAI initialized WITHOUT a company key: AI calls will be rejected until a key is provided")

            self.base_url = "https://api.openai.com/v1"
            self.model = self.config.OPENAI_MODEL
            self.api_type = "openai"
            logger.info(f"✅ OpenAI initialized with model {self.model}")

        except Exception as e:
            raise ContentGeneratorError(f"Failed to initialize OpenAI: {str(e)}")

    def _get_current_api_key(self):
        """Get the current API key"""
        if self.api_type == "gemini":
            if not self.api_keys:
                raise ContentGeneratorError(
                    "AI is not configured for your company. Please contact your administrator to add an AI API key."
                )
            return self.api_keys[self.current_key_index]
        if not self.api_key:
            raise ContentGeneratorError(
                "AI is not configured for your company. Please contact your administrator to add an AI API key."
            )
        return self.api_key
    
    def _rotate_api_key(self):
        """Rotate to the next API key"""
        if len(self.api_keys) > 1:
            old_index = self.current_key_index
            self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
            logger.warning(f"🔄 Rotating API key from index {old_index} to {self.current_key_index}")
            return True
        return False
    
    def set_knowledge_sources(self, knowledge_sources: list):
        """Set knowledge sources for enhanced content generation"""
        self.knowledge_sources = knowledge_sources
        logger.info(f"✅ Set {len(knowledge_sources)} knowledge sources for content generation")
    
    def set_company_name(self, company_name: str):
        """Set company name for personalized AI responses"""
        self.company_name = company_name
        logger.info(f"✅ Set company name: {company_name}")
            
    def _get_system_prompt(self, is_social_media: bool = False, minimal: bool = False) -> str:
        """Generate a dynamic company-aware system prompt.

        `minimal` skips the company knowledge base, competitive intelligence and
        content-generation instructions entirely. A classification call like priority
        or task-type detection answers from the title alone and never reads any of
        that, so building it anyway means paying for (and sometimes 3000+ characters
        of) knowledge-source content as input tokens on a call whose entire output is
        one digit or one word.
        """
        if minimal:
            return (
                "You answer with exactly the format requested and nothing else: "
                "no preamble, no explanation beyond what is asked for, no markdown."
            )

        # Extract company name (use provided name, or fall back to knowledge sources, or generic)
        company_name = self.company_name or "this company"
        
        if not self.company_name and self.knowledge_sources:
            company_sources = [ks for ks in self.knowledge_sources if ks.get('type') in ['COMPANY', 'OWN_COMPANY'] and ks.get('isActive')]
            if company_sources and company_sources[0].get('name'):
                company_name = company_sources[0].get('name')
        
        # Dynamic company-aware system prompt
        system_prompt = f"""You are the AI assistant helping {company_name} with task planning and content generation.

IMPORTANT: {company_name} is a business/organization. When generating task descriptions and goals, reference {company_name}'s ACTUAL business, products, services, and operations based on the knowledge sources provided below. DO NOT confuse {company_name} (the business) with the task management platform (which is just a tool they're using to organize work).

CONTENT GENERATION RULES:
1. Always reference specific {company_name} products, services, and business operations based on the knowledge provided below
2. Highlight industry-specific applications relevant to {company_name}'s actual business
3. Emphasize key differentiators and unique value propositions of {company_name} offerings
4. Include appropriate depth for the target audience
5. Focus on business outcomes: revenue growth, customer engagement, efficiency for {company_name}'s business
6. Use accurate industry terminology relevant to {company_name}'s industry

OUTPUT FORMAT:
Section 1 (Context): Explain WHY this task matters for {company_name}'s ACTUAL BUSINESS, which of {company_name}'s products/services/solutions it promotes, target audience, strategic value.
Section 2 (Strategy & Deliverables): Specific execution steps, deliverables, success metrics, ready-to-use content.

For social media: Include caption, hashtags, posting recommendations about {company_name}'s business.
For technical content: Include key talking points about {company_name}'s actual offerings and services."""
        
        # Add knowledge sources if available
        if self.knowledge_sources:
            # Filter by COMPANY or OWN_COMPANY type
            company_sources = [ks for ks in self.knowledge_sources if ks.get('type') in ['COMPANY', 'OWN_COMPANY'] and ks.get('isActive')]
            competitor_sources = [ks for ks in self.knowledge_sources if ks.get('type') == 'COMPETITOR' and ks.get('isActive')]
            
            if company_sources:
                system_prompt += f"\n\n=== {company_name.upper()} KNOWLEDGE BASE ===\n"
                system_prompt += f"Use the following information about {company_name} to inform your content generation:\n\n"
                for idx, source in enumerate(company_sources, 1):
                    system_prompt += f"\n[Source {idx}: {source.get('name', 'Unknown')}]\n"
                    if source.get('content'):
                        # Truncate content to avoid exceeding token limits
                        content = source['content'][:3000] + "..." if len(source['content']) > 3000 else source['content']
                        system_prompt += f"{content}\n"
                    elif source.get('description'):
                        # Fallback to description if content scraping failed (e.g., social media URLs)
                        system_prompt += f"Description: {source['description']}\n"
            
            if competitor_sources:
                system_prompt += "\n\n=== COMPETITIVE INTELLIGENCE & STRATEGY ===\n"
                system_prompt += f"Use this competitor analysis to help {company_name} compete effectively:\n\n"
                
                for idx, source in enumerate(competitor_sources, 1):
                    system_prompt += f"\n[Competitor {idx}: {source.get('name', 'Unknown')}]\n"
                    if source.get('content'):
                        # Truncate content to avoid exceeding token limits
                        content = source['content'][:2000] + "..." if len(source['content']) > 2000 else source['content']
                        system_prompt += f"{content}\n"
                    elif source.get('description'):
                        # Fallback to description if content scraping failed (e.g., social media URLs)
                        system_prompt += f"Description: {source['description']}\n"
                
                system_prompt += f"""

COMPETITIVE TASK GENERATION STRATEGY:
1. DIFFERENTIATION: Create tasks that highlight {company_name}'s unique advantages over competitors
2. GAP EXPLOITATION: Identify weaknesses in competitor offerings and create tasks to capitalize on them
3. INNOVATION: Suggest tasks that position {company_name} as more innovative or advanced
4. VALUE PROPOSITION: Focus tasks on {company_name}'s superior value, quality, or service
5. MARKET POSITIONING: Create tasks that strengthen {company_name}'s market position
6. COMPETITIVE EDGE: Recommend tasks that give {company_name} a clear competitive advantage

CONTENT GUIDELINES:
- Subtly highlight {company_name}'s advantages without directly attacking competitors
- Focus on what makes {company_name} better, faster, or more valuable
- Suggest improvements based on competitor strengths
- Identify opportunities where {company_name} can lead the market
- Create actionable tasks that enhance {company_name}'s competitive position
"""
        else:
            # Generic fallback if no knowledge sources provided
            system_prompt += f"""

ABOUT {company_name.upper()}:
Use the company information available or create general professional marketing content focused on:
- Product/service quality and innovation
- Customer value and satisfaction
- Industry expertise and leadership
- Business outcomes and ROI
"""
        
        # Add social media specific instructions
        if is_social_media:
            system_prompt += """

IMPORTANT: Since this is a SOCIAL MEDIA POST task, you MUST include a CAPTION section at the end with:
- A compelling caption for the post
- Relevant hashtags
- Call-to-action
- Emojis where appropriate

Format the caption section clearly as:

Caption:
[Your engaging caption here with emojis]

Hashtags: #hashtag1 #hashtag2 #hashtag3
"""
        return system_prompt

    def usage_report(self) -> Usage:
        """Token counts for everything this instance has spent, or None if unmeasured.

        None is deliberate: an endpoint omits the key entirely rather than sending
        zeros, because the backend reads zeros as a broken measurement and its own
        estimate is better than a $0 price on a call that was not free.
        """
        return dict(self.token_usage) if self.token_usage else None

    async def _make_request(
        self,
        prompt: str,
        minimal_system: bool = False,
        max_tokens: Optional[int] = None,
    ) -> Tuple[str, Usage]:
        """Make a request to the appropriate AI API, returning text and token counts.

        `minimal_system` and `max_tokens` exist for calls whose answer is a digit or a
        single word (priority, task type): the full company-aware system prompt costs
        real input tokens it never uses, and the generous default output ceiling is
        headroom this kind of answer will never need.
        """
        if self.api_type == "anthropic":
            text, usage = await self._make_anthropic_request(prompt, minimal_system, max_tokens)
        elif self.api_type in ("groq", "openai"):
            text, usage = await self._make_openai_compatible_request(prompt, minimal_system, max_tokens)
        else:
            text, usage = await self._make_gemini_request(prompt, minimal_system, max_tokens)

        self.token_usage = add_usage(self.token_usage, usage)
        return text, usage

    async def _make_anthropic_request(
        self, prompt: str, minimal_system: bool = False, max_tokens: Optional[int] = None,
    ) -> Tuple[str, Usage]:
        """Make a request to Claude with the same company-specific system prompt."""
        from .anthropic_client import generate_with_usage as anthropic_generate, AnthropicProviderError

        social_media_keywords = ['post', 'social media', 'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']
        is_social_media = any(keyword in prompt.lower() for keyword in social_media_keywords)

        try:
            return await anthropic_generate(
                api_key=self._get_current_api_key(),
                prompt=prompt,
                system_prompt=self._get_system_prompt(is_social_media, minimal=minimal_system),
                model=self.model,
                max_tokens=max_tokens,
                # A one-word or one-digit answer needs no extended reasoning before it.
                # Medium effort on a classification call spends invisible thinking
                # tokens on a question that was already answered by the prompt itself.
                effort="low" if minimal_system else None,
            )
        except AnthropicProviderError as e:
            # Re-raise in the shape the rest of this service (and the NestJS layer)
            # already knows how to classify.
            raise ContentGeneratorError(str(e))

    async def _make_openai_compatible_request(
        self, prompt: str, minimal_system: bool = False, max_tokens: Optional[int] = None,
    ) -> Tuple[str, Usage]:
        """Make a request to an OpenAI-compatible chat API (Groq or OpenAI)."""
        url = f"{self.base_url}/chat/completions"

        social_media_keywords = ['post', 'social media', 'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']
        is_social_media = any(keyword in prompt.lower() for keyword in social_media_keywords)

        system_prompt = self._get_system_prompt(is_social_media, minimal=minimal_system)

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "max_tokens": max_tokens or 4096,
            "stream": False
        }
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}'
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        reported = data.get('usage') or {}
                        return (
                            data['choices'][0]['message']['content'],
                            normalise_usage(reported.get('prompt_tokens'), reported.get('completion_tokens')),
                        )
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ {self.provider} API error ({response.status}): {error_text}")
                        # No fallback to env/platform keys, the company's own key is
                        # the only key used. Surface the error to the caller.
                        raise ContentGeneratorError(f"{self.provider} API failure ({response.status}): {error_text}")
        except Exception as e:
            if isinstance(e, ContentGeneratorError):
                raise
            logger.error(f"❌ {self.provider} request failed: {str(e)}")
            raise ContentGeneratorError(f"{self.provider} request failed: {str(e)}")

    async def _make_gemini_request(
        self, prompt: str, minimal_system: bool = False, max_tokens: Optional[int] = None,
    ) -> Tuple[str, Usage]:
        """Make a request to Gemini API with dynamic company-specific system prompt"""
        url = f"{self.base_url}/models/{self.model}:generateContent"

        # Check if this is a social media post
        social_media_keywords = ['post', 'social media', 'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']
        is_social_media = any(keyword in prompt.lower() for keyword in social_media_keywords)

        system_prompt = self._get_system_prompt(is_social_media, minimal=minimal_system)

        # Combine system prompt with user prompt
        full_prompt = f"{system_prompt}\n\nUser Task: {prompt}"

        payload = {
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }]
        }
        if max_tokens:
            payload["generationConfig"] = {"maxOutputTokens": max_tokens}
        
        # Try all available API keys with automatic fallback
        last_error = None
        attempts = 0
        max_attempts = len(self.api_keys)
        
        while attempts < max_attempts:
            current_key = self._get_current_api_key()
            headers = {
                'Content-Type': 'application/json',
                'X-goog-api-key': current_key
            }
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=payload) as response:
                        if response.status == 200:
                            data = await response.json()
                            if not data.get('candidates', []) or not data['candidates'][0].get('content'):
                                raise ContentGeneratorError("AI returned an empty response. This is usually caused by safety filters.")
                            
                            # Success! Log which key worked
                            if attempts > 0:
                                logger.info(f"✅ Request succeeded with fallback API key (index {self.current_key_index})")

                            reported = data.get('usageMetadata') or {}
                            return (
                                data['candidates'][0]['content']['parts'][0]['text'],
                                normalise_usage(reported.get('promptTokenCount'), reported.get('candidatesTokenCount')),
                            )
                        
                        # Handle quota/rate limit errors (429)
                        elif response.status == 429:
                            error_text = await response.text()
                            logger.warning(f"⚠️ API key {self.current_key_index} quota exceeded: {error_text}")
                            
                            # Try next key if available
                            if self._rotate_api_key():
                                attempts += 1
                                logger.info(f"🔄 Trying fallback API key {self.current_key_index} (attempt {attempts + 1}/{max_attempts})")
                                continue
                            else:
                                last_error = f"All API keys exhausted. Quota exceeded: {error_text}"
                                break
                        
                        # Handle other errors (400, 401, 403, 500 etc)
                        else:
                            error_text = await response.text()
                            # Parse JSON error if possible
                            try:
                                error_json = json.loads(error_text)
                                error_msg = error_json.get('error', {}).get('message', error_text)
                            except:
                                error_msg = error_text
                            
                            # CRITICAL: Detect expired or invalid keys and rotate!
                            is_key_error = any(msg in error_msg.lower() for msg in ["api key expired", "invalid api key", "key not found", "api_key_invalid"])
                            
                            if (response.status in [400, 401, 403]) and is_key_error:
                                logger.warning(f"❌ API key {self.current_key_index} is invalid or expired: {error_msg}")
                                # Try next key if available
                                if self._rotate_api_key():
                                    attempts += 1
                                    logger.info(f"🔄 Trying fallback API key {self.current_key_index} (attempt {attempts + 1}/{max_attempts})")
                                    continue
                                else:
                                    last_error = f"All API keys are invalid or expired: {error_msg}"
                                    break
                            
                            logger.error(f"❌ Gemini API failure ({response.status}): {error_msg}")
                            last_error = f"Gemini API failure ({response.status}): {error_msg}"
                            break
                            
            except aiohttp.ClientError as e:
                last_error = f"Connection error during AI request: {str(e)}"
                logger.error(f"❌ {last_error}")
                # Try another key for network errors
                if self._rotate_api_key():
                    attempts += 1
                    continue
                break
            
            except Exception as e:
                last_error = f"Error making Gemini request with key {self.current_key_index}: {str(e)}"
                logger.error(f"❌ {last_error}")
                break
        
        # All attempts failed
        raise ContentGeneratorError(last_error or "AI generation failed for unknown reasons")
            
    async def _make_legacy_request(self, prompt: str) -> str:
        """Make a request to legacy AI system"""
        try:
            async with aiohttp.ClientSession() as session:
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.legacy_key}'
                }
                
                payload = {
                    'model': self.legacy_model,
                    'prompt': prompt,
                    'temperature': 0.7,
                    'max_tokens': 500
                }
                
                async with session.post(
                    self.legacy_endpoint,
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Legacy API request failed: {error_text}")
                        raise ContentGeneratorError(f"Legacy API request failed: {error_text}")
                        
                    data = await response.json()
                    return data.get('text', '')
        except aiohttp.ClientError as e:
            logger.error(f"Legacy network error: {str(e)}")
            raise ContentGeneratorError(f"Legacy network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error making legacy request: {str(e)}")
            raise ContentGeneratorError(f"Error making legacy request: {str(e)}")

    async def _rate_limit(self):
        """Implement rate limiting for API calls"""
        if self.last_request_time:
            elapsed = (datetime.now() - self.last_request_time).total_seconds()
            if elapsed < self.request_interval:
                await asyncio.sleep(self.request_interval - elapsed)
        self.last_request_time = datetime.now()

    async def generate_description(self, title: str) -> str:
        """Generate a clean, concise task description - NO markdown, NO bold text"""
        try:
            await self._rate_limit()
            
            prompt = f"""Generate a clean, executive-level summary for this task.

Task: {title}

CRITICAL REQUIREMENTS:
- EXACTLY 2-3 sentences ONLY
- NO markdown formatting (no **, no #, no -, no *)
- NO bold text, NO italic text
- NO bullet points, NO numbered lists
- Plain text only
- Focus on WHAT needs to be done and WHY
- Keep it high-level - implementation details go in subtasks

EXAMPLE FORMAT:
"This task involves creating a comprehensive social media campaign for product launch. The objective is to increase brand awareness and drive engagement across multiple platforms. Success will be measured by reach metrics and conversion rates."

Respond with ONLY the plain text description, nothing else."""

            # _make_request has already added this call's tokens to self.token_usage,
            # which main.py reads once per response, so the counts are dropped here.
            description, _usage = await self._make_request(prompt)
            
            if not description:
                raise ContentGeneratorError("Gemini returned empty response")
                
            description = description.strip()
            
            # Clean up any markdown and formatting
            description = self._clean_ai_response(description)
            description = self._remove_markdown(description)
            
            # Validate the response
            if len(description.split()) < 15:
                raise ContentGeneratorError("Generated description is too short")
                
            return description

        except Exception as e:
            logger.error(f"Error generating description: {str(e)}")
            raise ContentGeneratorError(f"Failed to generate description: {str(e)}")

    def _clean_ai_response(self, text: str) -> str:
        """Remove introductory phrases and clean up AI responses"""
        # Remove common AI introductions
        introductions = [
            "Here's a", "Here is a", "I'll help you", "Let me help",
            "Certainly!", "Of course!", "Sure!", "Absolutely!",
            "Here's what", "Here is what", "I'll create", "I'll generate",
            "🚀", "✨", "🎯", "📝", "💡"  # Remove emojis
        ]
        
        for intro in introductions:
            if text.startswith(intro):
                text = text[len(intro):].strip()
                if text.startswith(":"):
                    text = text[1:].strip()
        
        return text
    
    def _remove_markdown(self, text: str) -> str:
        """Remove all markdown formatting from text"""
        import re
        
        # Remove bold (**text** or __text__)
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = re.sub(r'__([^_]+)__', r'\1', text)
        
        # Remove italic (*text* or _text_)
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        text = re.sub(r'_([^_]+)_', r'\1', text)
        
        # Remove headers (# ## ###)
        text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
        
        # Remove bullet points (- * •)
        text = re.sub(r'^[\-\*•]\s+', '', text, flags=re.MULTILINE)
        
        # Remove numbered lists (1. 2. 3.)
        text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
        
        # Clean up extra whitespace
        text = re.sub(r'\n\s*\n', '\n', text)
        text = text.strip()
        
        return text

    async def generate_goals(self, title: str) -> str:
        """Generate specific goals and success criteria using Gemini"""
        try:
            await self._rate_limit()
            
            prompt = f"""Generate measurable goals and success criteria for this task.

Task: {title}

REQUIREMENTS:
- 3-4 clear, measurable objectives
- Use simple bullet points (•)
- Each goal should have a clear outcome
- Focus on business value and measurable results
- NO introductions, NO explanations, NO extra text
- Plain text format only

EXAMPLE FORMAT:
• Increase social media engagement by 25% within 30 days
• Generate 50+ qualified leads through targeted campaigns
• Achieve 90% positive sentiment in audience feedback
• Complete all deliverables within budget and timeline

Respond with ONLY the bullet points, nothing else."""

            goals, _usage = await self._make_request(prompt)
            
            if not goals:
                raise ContentGeneratorError("Gemini returned empty response")
                
            goals = goals.strip()
            
            # Clean up any introductory phrases
            goals = self._clean_ai_response(goals)
            
            # Validate the response
            if len(goals.split()) < 15:
                raise ContentGeneratorError("Generated goals are too short")
                
            return goals

        except Exception as e:
            logger.error(f"Error generating goals: {str(e)}")
            raise ContentGeneratorError(f"Failed to generate goals: {str(e)}")

    async def analyze_priority(self, title: str, description: str) -> int:
        """Analyze task priority based on title and description"""
        try:
            await self._rate_limit()
            
            prompt = f"""Rate priority 1-5 (5=urgent/critical, 3=standard, 1=nice-to-have), weighing urgency, impact and dependencies.
Title: {title}
Description: {description}
Reply with ONLY the digit."""

            # Not tighter than this: on Claude, thinking and the visible answer share
            # the same budget, and a cap right at the answer's size risks the low-effort
            # thinking alone exhausting it before any digit is written.
            response, _usage = await self._make_request(prompt, minimal_system=True, max_tokens=200)
            
            # Extract number from response
            priority_str = response.strip()
            # Try to find a number in the response
            for char in priority_str:
                if char.isdigit():
                    priority = int(char)
                    if 1 <= priority <= 5:
                        return priority
            
            # Default to medium priority if parsing fails
            logger.warning(f"Could not parse priority from response: {response}")
            return 3

        except Exception as e:
            logger.error(f"Error analyzing priority: {str(e)}")
            return 3  # Default to medium priority on error

    async def detect_task_type(self, title: str) -> str:
        """Detect task type from title using AI with company context"""
        try:
            await self._rate_limit()
            
            prompt = f"""Categorize this task title into exactly one type:
SOCIAL_MEDIA_POST, VIDEO_CONTENT, BLOG_ARTICLE, EMAIL_CAMPAIGN, CASE_STUDY, WEBSITE_CONTENT, WHITEPAPER, WEBINAR, INFOGRAPHIC, PRESS_RELEASE, GENERAL

Title: "{title}"
Reply with ONLY the type name."""

            response, _usage = await self._make_request(prompt, minimal_system=True, max_tokens=200)
            task_type = response.strip().upper().replace(" ", "_")
            
            valid_types = [
                'SOCIAL_MEDIA_POST', 'VIDEO_CONTENT', 'BLOG_ARTICLE', 
                'EMAIL_CAMPAIGN', 'CASE_STUDY', 'WEBSITE_CONTENT',
                'WHITEPAPER', 'WEBINAR', 'INFOGRAPHIC', 'PRESS_RELEASE', 'GENERAL'
            ]
            
            if task_type in valid_types:
                return task_type
            
            logger.warning(f"Unknown task type: {response}, defaulting to GENERAL")
            return 'GENERAL'

        except Exception as e:
            logger.error(f"Error detecting task type: {str(e)}")
            return 'GENERAL'

    async def generate_subtasks(
        self, 
        title: str, 
        task_type: str, 
        description: str,
        workflow_phases: list,
        available_users: list = None
    ) -> list:
        """Generate intelligent subtasks with AI using real user data"""
        try:
            await self._rate_limit()
            
            phases_str = ", ".join(workflow_phases) if workflow_phases else "various phases"
            
            # Format available users for AI context
            users_context = ""
            if available_users:
                users_list = []
                for user in available_users:
                    user_id = user.get('id', 'unknown')
                    name = user.get('name', 'Unknown')
                    position = user.get('position', 'No position')
                    role = user.get('role', 'EMPLOYEE')
                    users_list.append(f"- ID: {user_id} | Name: {name} | Position: {position} | Role: {role}")
                users_context = f"\n\nAVAILABLE TEAM MEMBERS:\n" + "\n".join(users_list)
            else:
                users_context = "\n\nAVAILABLE TEAM MEMBERS:\n- Marketing Manager\n- Content Writer\n- Graphic Designer\n- Social Media Manager\n- Video Editor\n- Marketing Strategist\n- Marketing Coordinator\n- SEO Specialist"
            
            prompt = f"""Break this task into actionable subtasks.

Title: {title}
Type: {task_type}
Description: {description}
Workflow Phases: {phases_str}{users_context}

REQUIREMENTS:
1. Use ONLY the team members listed above, matched by exact name and position
2. Each description is ONE concise sentence: the specific action and its deliverable.
   No step-by-step breakdown, no separate deliverables or acceptance-criteria lines.
   The title plus that one sentence must be enough for the assignee to start.

Generate 3-6 subtasks as JSON array ONLY:
[
  {{
    "title": "Clear, actionable subtask title",
    "description": "One concise sentence: the action and its deliverable",
    "phaseName": "Phase from workflow phases above",
    "suggestedRole": "Position from available team members above",
    "suggestedUserId": "User ID if specific person found (use exact ID from list)",
    "suggestedUserName": "User name if specific person found (use exact name from list)",
    "estimatedHours": 3
  }}
]

Respond with ONLY the JSON array, no other text."""

            response, _usage = await self._make_request(prompt)
            
            try:
                # Extract JSON from response
                json_start = response.find('[')
                json_end = response.rfind(']') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = response[json_start:json_end]
                    subtasks = json.loads(json_str)
                    return subtasks
                else:
                    raise ValueError("No JSON found")
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse subtasks JSON: {e}")
                return self._generate_fallback_subtasks(title, task_type)

        except Exception as e:
            logger.error(f"Error generating subtasks: {str(e)}")
            return self._generate_fallback_subtasks(title, task_type)

    async def write_daily_brief(self, first_name: str, facts: str, max_length: int = 400) -> str:
        """
        Write one person's daily brief from counts the caller has already established.

        Deliberately not summarize_text. That method wraps whatever it is given in
        "Summarize the following text", so a caller who passes instructions gets those
        instructions summarized back: the brief once rendered as a paragraph describing
        the brief it should have written. Instructions belong in the prompt, and the
        prompt belongs here, not smuggled through a method built for something else.

        Only counts are passed in. The model never sees a task or ticket title, so it
        cannot name the wrong one, and it has no numbers of its own to reach for.
        """
        try:
            await self._rate_limit()

            prompt = f"""
            You are Aura, and you are talking to {first_name} about their own day.

            Write it TO {first_name}, not about them. Use "you" and "your" throughout.
            Never write "they", "them", "their", "the user" or "{first_name} has" -
            write "you have". You may use the name {first_name} once, at most.

            Three or four short sentences. No greeting, no sign-off, no lists, no
            headings, no markdown.

            Order: what you have already finished today, then meetings, then tasks, then
            tickets, then where you stand on the leaderboard. Skip anything whose count
            is zero, except meetings: if there are none today, say so.

            Open warmly on finished work if there is any. Use only the numbers below and
            never invent, estimate or name individual items.

            {facts}

            Reply with the brief itself and nothing else.
            """

            brief, _usage = await self._make_request(prompt)
            return brief.strip()[:max_length]

        except Exception as e:
            logger.error(f"Error in write_daily_brief: {str(e)}")
            # The caller composes its own brief from the same facts, so returning
            # nothing lets that one through rather than replacing it with an apology.
            return ""

    async def write_ticket_note(self, draft_title: str, facts: str, max_length: int = 320) -> str:
        """
        Tell someone what they are about to raise, and whether it already exists.

        The duplicate matching happened before this was called and its results are
        passed in. This phrases them; it does not decide them. A model asked to judge
        similarity would occasionally invent a ticket number, and a wrong number here
        sends somebody to a ticket that is not theirs.
        """
        try:
            await self._rate_limit()

            prompt = f"""
            You are Aura. Someone is about to raise this request: "{draft_title}"

            Write them two short sentences, speaking to them as "you". No greeting, no
            sign-off, no lists, no markdown.

            Say what the request is for and who it goes to. Then, if anything below is
            listed as a similar request, tell them plainly that it exists, give its
            number exactly as written, and say whether it is open or closed. If nothing
            similar is listed, say the request looks new.

            If a match shows "How it was solved", tell them what solved it last time, in
            your own words, and say they can close this without sending if that works
            for them too. That answer is the most useful thing you can give them, so
            lead with it over anything else about the match.

            If a match shows "Why it was cancelled", tell them this was asked before and
            turned down, give the reason, and say they should raise it again only if
            something has changed since, and to say what changed. A refusal matters more
            than a duplicate, so lead with that if both appear.

            Use only what is below. Never invent a ticket number, a status, a name or a
            solution. Do not tell them not to raise it; the decision is theirs.

            {facts}

            Reply with the note itself and nothing else.
            """

            note, _usage = await self._make_request(prompt)
            return note.strip()[:max_length]

        except Exception as e:
            logger.error(f"Error in write_ticket_note: {str(e)}")
            # The caller composed the same note from the same facts, so an empty string
            # lets that one through rather than replacing it with an apology.
            return ""

    async def summarize_text(self, text: str, max_length: int = 150) -> str:
        """Summarize long text into a concise summary"""
        try:
            await self._rate_limit()
            
            prompt = f"""
            Summarize the following text into a concise, professional summary.
            Max Length: {max_length} characters.
            Focus on: Key decisions, action items, and main themes.
            
            Text to summarize:
            {text[:10000]}  # Limit input to 10k chars for safety
            
            Respond with ONLY the summary text.
            """
            
            summary, _usage = await self._make_request(prompt)
            return summary.strip()[:max_length]
            
        except Exception as e:
            logger.error(f"Error in summarize_text: {str(e)}")
            return "Unable to generate summary at this time."

    def _generate_fallback_subtasks(self, title: str, task_type: str) -> list:
        """Generate basic subtasks as fallback"""
        templates = {
            'SOCIAL_MEDIA_POST': [
                {"title": "Research & Strategy", "description": "Define objectives", "phaseName": "Planning", "suggestedRole": "Marketing Strategist", "estimatedHours": 2},
                {"title": "Content Creation", "description": "Write copy and visuals", "phaseName": "Creation", "suggestedRole": "Content Writer", "estimatedHours": 3},
                {"title": "Review & Approval", "description": "Quality check", "phaseName": "Review", "suggestedRole": "Marketing Manager", "estimatedHours": 1},
                {"title": "Publishing", "description": "Schedule and publish", "phaseName": "Publishing", "suggestedRole": "Social Media Manager", "estimatedHours": 1},
            ],
            'GENERAL': [
                {"title": "Planning", "description": "Plan execution", "phaseName": "Planning", "suggestedRole": "Project Manager", "estimatedHours": 2},
                {"title": "Execution", "description": "Complete deliverables", "phaseName": "In Progress", "suggestedRole": "Team Member", "estimatedHours": 5},
                {"title": "Review", "description": "Quality review", "phaseName": "Review", "suggestedRole": "Manager", "estimatedHours": 1},
            ],
        }
        
        return templates.get(task_type, templates['GENERAL'])