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
    def __init__(self, model_manager=None):
        self.model_manager = model_manager
        self.config = get_config()
        self.last_request_time = None
        self.request_interval = 1.0  # Minimum time between requests in seconds
        
        if self.config.AI_PROVIDER == "gemini":
            self._initialize_gemini()
        else:
            self._initialize_legacy()
        
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
            
    def _initialize_legacy(self):
        """Initialize legacy AI system"""
        try:
            if not self.model_manager:
                raise ContentGeneratorError(
                    "Model manager is required for legacy AI system"
                )
            
            self.legacy_key = self.config.LEGACY_AI_KEY
            self.legacy_endpoint = self.config.LEGACY_AI_ENDPOINT
            self.legacy_model = self.config.LEGACY_MODEL
            
            if not all([self.legacy_key, self.legacy_endpoint]):
                raise ContentGeneratorError(
                    "Legacy AI configuration incomplete. Please check LEGACY_AI_KEY "
                    "and LEGACY_AI_ENDPOINT in your environment variables."
                )
            
            logger.info("✅ Legacy AI system initialized successfully")
            
        except Exception as e:
            raise ContentGeneratorError(f"Failed to initialize legacy AI: {str(e)}")

    async def _make_request(self, prompt: str) -> str:
        """Make a request to the configured AI provider"""
        if self.config.AI_PROVIDER == "gemini":
            return await self._make_gemini_request(prompt)
        else:
            return await self._make_legacy_request(prompt)
            
    async def _make_gemini_request(self, prompt: str) -> str:
        """Make a request to Gemini API"""
        url = f"{self.base_url}/models/{self.model}:generateContent"
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
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