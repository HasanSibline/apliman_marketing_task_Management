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
        
        # Apliman system prompt
        system_prompt = """You are the AI content generator for Apliman (www.apliman.com).
Your purpose is to generate strategic and actionable marketing content tailored to Apliman's services, knowledge, and mindset.

Rules:

Knowledge Source → Use only Apliman's brand, expertise, services, and positioning. No external assumptions.

Output Structure → Always reply with two plain text sections WITHOUT using "Description:" or "Goals:" as headers:

Section 1 (Context): A detailed, business-oriented explanation of the user's task title in Apliman's context. Describe why this content matters, how it ties into Apliman's offerings, and what strategic value it provides. DO NOT start with "Description:" - just begin with the content directly.

Section 2 (Strategy & Deliverables): A comprehensive breakdown of what the user should aim to achieve, including the final crafted output/content that solves the task (e.g., Instagram bio, ad copy, blog draft). Provide clear reasoning, strategic insights, and the deliverable in the same section. DO NOT start with "Goals:" - just begin with the content directly.

Style & Format →

No intros like "Okay…" or "Let's…"
No bold/italics/markdown formatting.
Professional, business-driven, and aligned with Apliman's innovative voice.
Every response must include actual deliverables (not just advice).
DO NOT use "Description:" or "Goals:" as section headers - just provide the content directly.

Example

Input (user title):
"Writing about Aiservice provided by www.apliman.com short for a bio on Instagram"

Output (Gemini):

Apliman's AI service empowers businesses with marketing automation, hyper-personalized engagement, and advanced analytics. Positioning this on Instagram requires translating complex capabilities into a simple, memorable bio that resonates with businesses seeking innovation and measurable growth. This bio will serve as the first touchpoint to communicate trust, expertise, and digital leadership.

Increase profile visits by presenting Apliman as a leader in AI-driven marketing.

Build brand recall by associating Apliman with innovation, ROI, and personalization.

Provide a ready-to-use Instagram bio:
"AI-powered marketing by Apliman. Personalize engagement, boost ROI, and drive growth. www.apliman.com"

This way:

First section = context + explanation for the user.
Second section = strategy + actual output."""
        
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