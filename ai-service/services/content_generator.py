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
        """Generate a detailed task description using Gemini"""
        try:
            await self._rate_limit()
            
            prompt = f"""
            Task: Generate a detailed and specific description for: "{title}"
            
            Requirements:
            1. Start with a clear overview of what needs to be done
            2. Include specific steps or requirements
            3. Mention any tools, resources, or dependencies needed
            4. Consider potential challenges or important considerations
            5. Keep the tone professional and actionable
            
            Important:
            - Be specific to {title} - avoid generic content
            - Include concrete details and examples
            - Make it actionable and clear
            - Focus on practical implementation
            
            Generate a cohesive paragraph (3-4 sentences) that covers these points.
            """

            description = await self._make_request(prompt)
            
            if not description:
                raise ContentGeneratorError("Gemini returned empty response")
                
            description = description.strip()
            
            # Validate the response
            if len(description.split()) < 10:
                raise ContentGeneratorError("Generated description is too short")
                
            return description

        except Exception as e:
            logger.error(f"Error generating description: {str(e)}")
            raise ContentGeneratorError(f"Failed to generate description: {str(e)}")

    async def generate_goals(self, title: str) -> str:
        """Generate specific goals and success criteria using Gemini"""
        try:
            await self._rate_limit()
            
            prompt = f"""
            Task: Generate specific goals and success criteria for: "{title}"
            
            Requirements:
            1. Goals must be specific to {title}
            2. Include measurable outcomes
            3. Consider quality standards
            4. Add timeline or deadline aspects
            5. Include stakeholder considerations
            
            Format:
            Goals:
            1. [Specific, measurable goal]
            2. [Specific, measurable goal]
            3. [Specific, measurable goal]

            Success Criteria:
            - [Clear, verifiable criterion]
            - [Clear, verifiable criterion]
            - [Clear, verifiable criterion]
            - [Clear, verifiable criterion]
            
            Important:
            - Make each goal specific to {title}
            - Include numbers or metrics where possible
            - Make success criteria clearly verifiable
            - Focus on practical, achievable outcomes
            """

            goals = await self._make_request(prompt)
            
            if not goals:
                raise ContentGeneratorError("Gemini returned empty response")
                
            goals = goals.strip()
            
            # Validate the response format
            if "Goals:" not in goals or "Success Criteria:" not in goals:
                raise ContentGeneratorError("Generated goals do not match required format")
                
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
        workflow_phases: list
    ) -> list:
        """Generate intelligent subtasks with AI"""
        try:
            await self._rate_limit()
            
            phases_str = ", ".join(workflow_phases) if workflow_phases else "various phases"
            
            prompt = f"""
            Generate 4-8 specific subtasks for this Apliman marketing task:
            
            Title: {title}
            Type: {task_type}
            Description: {description}
            Workflow Phases: {phases_str}
            
            For each subtask provide:
            1. Title (clear, actionable)
            2. Description (what needs to be done)
            3. Phase Name (from: {phases_str})
            4. Suggested Role (Marketing Manager, Content Writer, Graphic Designer, Video Editor, Social Media Manager, SEO Specialist)
            5. Estimated Hours (realistic)
            
            Format as JSON array:
            [
              {{
                "title": "Research competitors",
                "description": "Analyze 5 competitors' strategies",
                "phaseName": "Research",
                "suggestedRole": "Marketing Strategist",
                "estimatedHours": 3
              }}
            ]
            
            Make subtasks specific to Apliman's telecom/CPaaS solutions.
            """

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