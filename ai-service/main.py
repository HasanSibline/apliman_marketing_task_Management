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
content_generator = ContentGenerator()

@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    try:
        # Get system metrics
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        # Test Gemini connection
        test_result = None
        error_message = None
        try:
            test_result = await content_generator.generate_description("test task")
        except Exception as e:
            error_message = str(e)
        
        # Gemini status
        provider_status = {
            "ai_provider": "gemini",
            "gemini_status": "connected" if test_result else "error",
            "gemini_model": config.GEMINI_MODEL,
            "gemini_error": error_message,
            "api_key_configured": bool(config.GOOGLE_API_KEY)
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

@app.get("/keepalive")
async def keepalive():
    """Keepalive endpoint to prevent service sleep"""
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "AI service is awake and running"
    }

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
            "ai_provider": "gemini",
            "test_text": test_text,
            "results": {
                "description": description,
                "goals": goals
            }
        }
    except Exception as e:
        logger.error(f"AI test failed: {e}")
        
        # Prepare help message
        help_message = "Please check your GOOGLE_API_KEY and internet connection"
        
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
            "ai_provider": "gemini",
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
                "ai_provider": "gemini"
            }
        )

@app.post("/performance-insights")
async def generate_performance_insights(request: dict):
    """Generate performance insights from analytics data"""
    try:
        analytics_data = request.get("analytics", {})
        
        # Create a prompt for performance insights
        prompt = f"""
        Based on the following analytics data, provide performance insights, recommendations, and trends:
        
        Dashboard Data: {analytics_data.get('dashboard', {})}
        User Data: {analytics_data.get('user', {})}
        Team Data: {analytics_data.get('team', {})}
        Task Data: {analytics_data.get('tasks', {})}
        
        Please provide:
        1. Key insights about performance
        2. Actionable recommendations
        3. Trends and patterns observed
        
        Format the response as JSON with 'insights', 'recommendations', and 'trends' arrays.
        """
        
        # Generate insights using Gemini
        response = await content_generator._make_gemini_request(prompt)
        
        # Try to parse as JSON, fallback to structured response
        try:
            import json
            parsed_response = json.loads(response)
            return {
                "insights": parsed_response.get("insights", ["Performance analysis completed"]),
                "recommendations": parsed_response.get("recommendations", ["Continue monitoring performance"]),
                "trends": parsed_response.get("trends", ["Data analysis in progress"]),
                "ai_provider": "gemini"
            }
        except json.JSONDecodeError:
            # Fallback if response isn't valid JSON
            return {
                "insights": [response[:200] + "..." if len(response) > 200 else response],
                "recommendations": ["Review the insights above for actionable steps"],
                "trends": ["Continue monitoring for patterns"],
                "ai_provider": "gemini"
            }
            
    except Exception as e:
        logger.error(f"Error generating performance insights: {e}")
        return {
            "insights": ["Unable to generate insights at this time"],
            "recommendations": ["Please try again later"],
            "trends": ["Data analysis temporarily unavailable"],
            "ai_provider": "gemini",
            "error": str(e)
        }

# Startup event
@app.on_event("startup")
async def startup_event():
    """Run startup tasks"""
    logger.info("Starting AI service...")
    try:
        # Validate configuration
        config.validate()
        logger.info("Configuration validated successfully")
        
        # Log Gemini configuration
        logger.info("Using AI provider: Gemini")
        logger.info(f"Gemini model: {config.GEMINI_MODEL}")
        
        # Test Gemini connection
        test_result = await content_generator.generate_description("test")
        if test_result:
            logger.info("Gemini connection tested successfully")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise e

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run cleanup tasks"""
    logger.info("Shutting down AI service...")