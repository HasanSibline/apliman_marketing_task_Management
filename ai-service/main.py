from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from datetime import datetime
import psutil
import os
from config import get_config
from services.content_generator import ContentGenerator
from typing import Optional
from pydantic import BaseModel

# Configure logging
logger = logging.getLogger("ai_service")

# Initialize FastAPI app
app = FastAPI(
    title="AI Task Management Service",
    description="AI-powered service for task management using Google's Gemini",
    version="1.0.0"
)

# Get configuration
config = get_config()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
content_generator = ContentGenerator(None)  # We don't need model_manager for Gemini

@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    try:
        # Get system metrics
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        # Test AI provider connection
        test_result = None
        error_message = None
        try:
            test_result = await content_generator.generate_description("test task")
        except Exception as e:
            error_message = str(e)
        
        # Prepare provider-specific status
        provider_status = {}
        if config.AI_PROVIDER == "gemini":
            provider_status = {
                "ai_provider": "gemini",
                "gemini_status": "connected" if test_result else "error",
                "gemini_model": config.GEMINI_MODEL,
                "gemini_error": error_message,
                "api_key_configured": bool(config.GOOGLE_API_KEY)
            }
        else:
            provider_status = {
                "ai_provider": "legacy",
                "legacy_status": "connected" if test_result else "error",
                "legacy_model": config.LEGACY_MODEL,
                "legacy_error": error_message,
                "legacy_endpoint_configured": bool(config.LEGACY_AI_ENDPOINT),
                "legacy_key_configured": bool(config.LEGACY_AI_KEY)
            }
        
        return {
            "status": "healthy" if test_result else "degraded",
            "timestamp": datetime.utcnow().isoformat(),
            "environment": config.ENVIRONMENT,
            "memory_usage_mb": round(memory_mb, 2),
            **provider_status  # Include provider-specific status
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        )

@app.post("/test-ai")
async def test_ai(test_text: Optional[str] = "This is a test task"):
    """Test AI provider integration with optional test text"""
    try:
        # Generate both description and goals
        description = await content_generator.generate_description(test_text)
        goals = await content_generator.generate_goals(test_text)
        
        return {
            "status": "success",
            "timestamp": datetime.utcnow().isoformat(),
            "ai_provider": config.AI_PROVIDER,
            "test_text": test_text,
            "results": {
                "description": description,
                "goals": goals
            }
        }
    except Exception as e:
        logger.error(f"AI test failed: {e}")
        
        # Prepare provider-specific help message
        help_message = (
            "Please check your GOOGLE_API_KEY and internet connection"
            if config.AI_PROVIDER == "gemini"
            else "Please check your LEGACY_AI_KEY, LEGACY_AI_ENDPOINT and internet connection"
        )
        
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": str(e),
                "ai_provider": config.AI_PROVIDER,
                "help": help_message
            }
        )

class GenerateContentRequest(BaseModel):
    title: str
    type: str = "task"

@app.post("/generate-content")
async def generate_content(request: GenerateContentRequest):
    """Generate content using configured AI provider"""
    try:
        # Generate content
        description = await content_generator.generate_description(request.title)
        goals = await content_generator.generate_goals(request.title)
        
        return {
            "ai_provider": config.AI_PROVIDER,
            "description": description,
            "goals": goals
        }
    except Exception as e:
        logger.error(f"Content generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Content generation failed: {str(e)}",
                "ai_provider": config.AI_PROVIDER
            }
        )

# Startup event
@app.on_event("startup")
async def startup_event():
    """Run startup tasks"""
    logger.info("Starting AI service...")
    try:
        # Validate configuration
        config.validate()
        logger.info("Configuration validated successfully")
        
        # Log AI provider configuration
        logger.info(f"Using AI provider: {config.AI_PROVIDER}")
        if config.AI_PROVIDER == "gemini":
            logger.info(f"Gemini model: {config.GEMINI_MODEL}")
        else:
            logger.info(f"Legacy model: {config.LEGACY_MODEL}")
            logger.info(f"Legacy endpoint: {config.LEGACY_AI_ENDPOINT}")
        
        # Test AI provider connection
        test_result = await content_generator.generate_description("test")
        if test_result:
            logger.info(f"{config.AI_PROVIDER.title()} connection tested successfully")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise e

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run cleanup tasks"""
    logger.info("Shutting down AI service...")