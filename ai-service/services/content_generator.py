import logging
from typing import Dict, Any, Optional
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

class ContentGenerator:
    def __init__(self):
        self.config = get_config()
        self.last_request_time = None
        self.request_interval = 1.0  # Minimum time between requests in seconds
        self._initialize_gemini()
        
    def _initialize_gemini(self):
        """Initialize Gemini with API key validation"""
        try:
            self.api_key = self.config.GOOGLE_API_KEY
            if not self.api_key:
                raise ContentGeneratorError(
                    "GOOGLE_API_KEY not found in environment variables. "
                    "Please create a .env file with your API key."
                )
            
            self.base_url = "https://generativelanguage.googleapis.com/v1beta"
            self.model = self.config.GEMINI_MODEL
            self.headers = {
                'Content-Type': 'application/json',
                'X-goog-api-key': self.api_key
            }
            
            # Skip test in initialization to avoid event loop issues
            logger.info("✅ Gemini initialized successfully")
            
        except Exception as e:
            raise ContentGeneratorError(f"Failed to initialize Gemini: {str(e)}")
            
    async def _make_request(self, prompt: str) -> str:
        """Make a request to Gemini API"""
        return await self._make_gemini_request(prompt)
            
    async def _make_gemini_request(self, prompt: str) -> str:
        """Make a request to Gemini API with Apliman system prompt"""
        url = f"{self.base_url}/models/{self.model}:generateContent"
        
        # Check if this is a social media post
        social_media_keywords = ['post', 'social media', 'instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']
        is_social_media = any(keyword in prompt.lower() for keyword in social_media_keywords)
        
        # Apliman system prompt with comprehensive business context
        system_prompt = """You are the AI assistant for Apliman Technologies' internal marketing task management system.

ABOUT APLIMAN:
Apliman is a leading provider of integrated communication solutions with presence in 50+ countries, serving 75+ governmental and private enterprises globally.

CORE PRODUCTS & SERVICES:
1. aïda - Intelligent platform enabling 100+ customer journey automations with AI-driven personalization
2. aïReach - CPaaS (Communication Platform as a Service) supporting Voice, SMS, WhatsApp, Email, RCS with AI-driven channel optimization
3. Call Completion Solutions (CCS) - Converting failed calls into successful connections
4. Smart Ring Back Tone (SRBT) - Advanced ringback tone system with smart engagement features
5. NameTag - Numeric digital identities for brands
6. Interactive Voice Response (IVR) - Automated customer service systems

TARGET INDUSTRIES:
- Telecom Mobile Network Operators (MNOs)
- Fintech, Education, Travel & Hospitality, E-Commerce, Government

CONTENT GENERATION RULES:
1. Always reference specific Apliman products (aïda, aïReach, CCS, SRBT, etc.)
2. Highlight industry-specific applications
3. Emphasize key differentiators: AI-driven, multi-channel, scalable, secure
4. Include technical depth for B2B/Enterprise audience
5. Focus on business outcomes: revenue growth, customer engagement, efficiency
6. Use telecom/tech terminology accurately (CPaaS, MNO, customer journey, omnichannel)

OUTPUT FORMAT:
Section 1 (Context): Explain WHY this task matters for Apliman's business, which products/solutions it promotes, target audience, strategic value.
Section 2 (Strategy & Deliverables): Specific execution steps, deliverables, success metrics, ready-to-use content.

For social media: Include caption, hashtags, posting recommendations.
For technical content: Include key talking points about Apliman's technology."""
        
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
        
        # Combine system prompt with user prompt
        full_prompt = f"{system_prompt}\n\nUser Task: {prompt}"
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }]
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=self.headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Gemini API request failed: {error_text}")
                        raise ContentGeneratorError(f"Gemini API request failed: {error_text}")
                        
                    data = await response.json()
                    if not data.get('candidates', []):
                        raise ContentGeneratorError("No response from Gemini")
                        
                    return data['candidates'][0]['content']['parts'][0]['text']
        except aiohttp.ClientError as e:
            logger.error(f"Gemini network error: {str(e)}")
            raise ContentGeneratorError(f"Gemini network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error making Gemini request: {str(e)}")
            raise ContentGeneratorError(f"Error making Gemini request: {str(e)}")
            
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

            description = await self._make_request(prompt)
            
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

            goals = await self._make_request(prompt)
            
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
            
            prompt = f"""
            Task: Analyze the priority level for this task:
            Title: {title}
            Description: {description}
            
            Determine the priority level (1-5) based on:
            1. Urgency - How time-sensitive is this task?
            2. Impact - How much value/impact will this deliver?
            3. Dependencies - Are other tasks waiting on this?
            4. Complexity - How challenging or risky is this?
            5. Strategic importance - How critical is this to business goals?
            
            Priority Scale:
            5 = Critical/Urgent (immediate action required)
            4 = High (important, short timeline)
            3 = Medium (standard priority)
            2 = Low (can be scheduled flexibly)
            1 = Minimal (nice-to-have)
            
            Reply with ONLY a single number (1-5) representing the priority level.
            """

            response = await self._make_request(prompt)
            
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
        """Detect task type from title using AI with Apliman context"""
        try:
            await self._rate_limit()
            
            prompt = f"""
            Analyze this task title and categorize it into ONE of these marketing task types:
            
            - SOCIAL_MEDIA_POST: Social media content about Apliman products
            - VIDEO_CONTENT: Product demos, explainer videos, testimonials
            - BLOG_ARTICLE: Thought leadership, technical articles
            - EMAIL_CAMPAIGN: Product announcements, feature launches
            - CASE_STUDY: Customer success stories, ROI demonstrations
            - WEBSITE_CONTENT: Landing pages, product pages
            - WHITEPAPER: Technical documentation, research papers
            - WEBINAR: Live presentations, product training
            - INFOGRAPHIC: Data visualizations, process flows
            - PRESS_RELEASE: Company announcements, partnerships
            - GENERAL: Other marketing activities
            
            Task Title: "{title}"
            
            Reply with ONLY the task type name (e.g., "SOCIAL_MEDIA_POST")
            """

            response = await self._make_request(prompt)
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
            
            prompt = f"""Generate DETAILED subtasks with step-by-step instructions.

Title: {title}
Type: {task_type}
Description: {description}
Workflow Phases: {phases_str}{users_context}

CRITICAL REQUIREMENTS:
1. Use ONLY the team members listed above - match by exact name and position
2. Each subtask description must be DETAILED with 3-5 specific implementation steps
3. Main task has high-level description, subtasks have ALL the details
4. Include specific deliverables and acceptance criteria

SUBTASK DESCRIPTION FORMAT:
"Step 1: [Specific action with details]
Step 2: [Specific action with details]  
Step 3: [Specific action with details]
Deliverables: [Specific outputs expected]
Acceptance criteria: [How to verify completion]"

Generate 3-6 subtasks as JSON array ONLY:
[
  {{
    "title": "Clear, actionable subtask title",
    "description": "DETAILED step-by-step instructions (3-5 sentences minimum)",
    "phaseName": "Phase from workflow phases above",
    "suggestedRole": "Position from available team members above",
    "suggestedUserId": "User ID if specific person found (use exact ID from list)",
    "suggestedUserName": "User name if specific person found (use exact name from list)",
    "estimatedHours": 3
  }}
]

Make each description actionable and detailed. The assigned person should know exactly what to do.
Respond with ONLY the JSON array, no other text."""

            response = await self._make_request(prompt)
            
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