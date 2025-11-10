from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from datetime import datetime
import psutil
import os
import aiohttp
from config import get_config
from services.content_generator import ContentGenerator
from services.web_scraper import WebScraper
from services.chat_service import ChatService
from typing import Optional, List, Dict, Any
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
web_scraper = WebScraper()
# Get the first API key for chat service
api_keys = config.get_api_keys()
chat_service = ChatService(api_keys[0] if api_keys else config.GOOGLE_API_KEY)

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
        
        # Gemini status with multiple keys info
        api_keys = config.get_api_keys()
        provider_status = {
            "ai_provider": "gemini",
            "gemini_status": "connected" if test_result else "error",
            "gemini_model": config.GEMINI_MODEL,
            "gemini_error": error_message,
            "api_keys_configured": len(api_keys),
            "api_keys_preview": [f"{key[:10]}...{key[-4:]}" for key in api_keys] if api_keys else []
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

@app.get("/api-keys-status")
async def api_keys_status():
    """Check status of all configured API keys"""
    try:
        api_keys = config.get_api_keys()
        if not api_keys:
            return {
                "status": "error",
                "message": "No API keys configured",
                "keys_count": 0
            }
        
        keys_status = []
        for i, key in enumerate(api_keys):
            key_preview = f"{key[:10]}...{key[-4:]}"
            
            # Try a simple test request with this key
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent"
            headers = {
                'Content-Type': 'application/json',
                'X-goog-api-key': key
            }
            payload = {
                "contents": [{
                    "parts": [{
                        "text": "test"
                    }]
                }]
            }
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as response:
                        if response.status == 200:
                            keys_status.append({
                                "index": i,
                                "preview": key_preview,
                                "status": "active",
                                "message": "Working"
                            })
                        elif response.status == 429:
                            error_text = await response.text()
                            keys_status.append({
                                "index": i,
                                "preview": key_preview,
                                "status": "quota_exceeded",
                                "message": "Quota exceeded",
                                "error": error_text[:200]
                            })
                        else:
                            error_text = await response.text()
                            keys_status.append({
                                "index": i,
                                "preview": key_preview,
                                "status": "error",
                                "message": f"HTTP {response.status}",
                                "error": error_text[:200]
                            })
            except Exception as e:
                keys_status.append({
                    "index": i,
                    "preview": key_preview,
                    "status": "error",
                    "message": "Request failed",
                    "error": str(e)[:200]
                })
        
        active_count = sum(1 for k in keys_status if k["status"] == "active")
        
        return {
            "status": "ok" if active_count > 0 else "degraded",
            "keys_count": len(api_keys),
            "active_keys": active_count,
            "keys": keys_status
        }
    except Exception as e:
        logger.error(f"Error checking API keys status: {e}")
        return {
            "status": "error",
            "message": str(e)
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
    knowledge_sources: Optional[List[dict]] = None  # Optional knowledge sources
    company_name: Optional[str] = None  # Company name for personalized AI responses

class ScrapeUrlRequest(BaseModel):
    url: str

@app.post("/generate-content")
async def generate_content(request: GenerateContentRequest):
    """Generate content using configured AI provider with optional knowledge sources"""
    try:
        # Set knowledge sources in content generator if provided
        if request.knowledge_sources:
            content_generator.set_knowledge_sources(request.knowledge_sources)
        
        # Set company name if provided
        if request.company_name:
            content_generator.set_company_name(request.company_name)
        
        # Generate content
        description = await content_generator.generate_description(request.title)
        goals = await content_generator.generate_goals(request.title)
        priority = await content_generator.analyze_priority(request.title, description)
        
        return {
            "ai_provider": "gemini",
            "description": description,
            "goals": goals,
            "priority": priority
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

@app.post("/scrape-url")
async def scrape_url(request: ScrapeUrlRequest):
    """Scrape content from a URL"""
    try:
        result = await web_scraper.scrape_url(request.url)
        return result
    except Exception as e:
        logger.error(f"URL scraping failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"URL scraping failed: {str(e)}"
            }
        )

class ChatRequest(BaseModel):
    message: str
    userContext: Dict[str, Any]
    user: Dict[str, Any]
    conversationHistory: List[Dict[str, Any]]
    knowledgeSources: List[Dict[str, Any]]
    additionalContext: Dict[str, Any]
    isDeepAnalysis: bool = False
    companyName: Optional[str] = None  # Company name for personalized responses

@app.post("/chat")
async def chat(request: ChatRequest):
    """Process chat message with ApliChat"""
    try:
        result = chat_service.process_chat_message(
            message=request.message,
            user_context=request.userContext,
            user=request.user,
            conversation_history=request.conversationHistory,
            knowledge_sources=request.knowledgeSources,
            additional_context=request.additionalContext,
            is_deep_analysis=request.isDeepAnalysis,
            company_name=request.companyName  # Pass company name
        )
        return result
    except Exception as e:
        logger.error(f"Chat processing failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Chat processing failed: {str(e)}"
            }
        )

@app.post("/detect-task-type")
async def detect_task_type(request: dict):
    """Detect task type from title"""
    try:
        title = request.get("title", "")
        if not title:
            raise HTTPException(status_code=400, detail="Title required")
        
        task_type = await content_generator.detect_task_type(title)
        
        return {
            "task_type": task_type,
            "ai_provider": "gemini"
        }
    except Exception as e:
        logger.error(f"Task type detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-subtasks")
async def generate_subtasks(request: dict):
    """Generate intelligent subtasks"""
    try:
        title = request.get("title", "")
        description = request.get("description", "")
        task_type = request.get("taskType", "GENERAL")
        workflow_phases = request.get("workflowPhases", [])
        available_users = request.get("availableUsers", [])
        knowledge_sources = request.get("knowledgeSources", None)
        
        if not title:
            raise HTTPException(status_code=400, detail="Title required")
        
        # Set knowledge sources if provided
        if knowledge_sources:
            content_generator.set_knowledge_sources(knowledge_sources)
        
        subtasks = await content_generator.generate_subtasks(
            title, task_type, description, workflow_phases, available_users
        )
        
        return {
            "ai_provider": "gemini",
            "subtasks": subtasks
        }
    except Exception as e:
        logger.error(f"Subtask generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

class LearnFromTasksRequest(BaseModel):
    userContext: Dict[str, Any]
    completedTasks: List[Dict[str, Any]]
    activeTasks: List[Dict[str, Any]]

@app.post("/learn-from-tasks")
async def learn_from_tasks(request: LearnFromTasksRequest):
    """Learn from user's task history to extract insights and patterns"""
    try:
        learned_context = chat_service.learn_from_task_history(
            user_context=request.userContext,
            completed_tasks=request.completedTasks,
            active_tasks=request.activeTasks
        )
        
        return {
            "success": True,
            "learnedContext": learned_context,
            "ai_provider": "gemini"
        }
    except Exception as e:
        logger.error(f"Learning from tasks failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Learning from tasks failed: {str(e)}"
            }
        )

class LearnDomainInterestsRequest(BaseModel):
    domainTopic: str
    userQuestions: List[str]
    existingKnowledge: Dict[str, Any]

@app.post("/learn-domain-interests")
async def learn_domain_interests(request: LearnDomainInterestsRequest):
    """Learn what the user is interested in regarding specific domains"""
    try:
        learned_interests = chat_service.learn_about_domain_interests(
            domain_topic=request.domainTopic,
            user_questions=request.userQuestions,
            existing_knowledge=request.existingKnowledge
        )
        
        return {
            "success": True,
            "learnedInterests": learned_interests,
            "ai_provider": "gemini"
        }
    except Exception as e:
        logger.error(f"Learning domain interests failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Learning domain interests failed: {str(e)}"
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
        
        # Log Gemini configuration
        logger.info("Using AI provider: Gemini")
        logger.info(f"Gemini model: {config.GEMINI_MODEL}")
        
        # Skip startup test to save API quota
        logger.info("⚠️ Skipping Gemini connection test to preserve API quota")
        logger.info("✅ AI service ready (connection will be tested on first request)")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        # Don't crash on startup - allow service to start even if config issues
        logger.warning("⚠️ Starting service despite configuration issues - errors will be caught per-request")
        pass

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run cleanup tasks"""
    logger.info("Shutting down AI service...")

# Main entry point for direct execution
if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment (Render sets this automatically)
    port = int(os.getenv("PORT", config.PORT))
    host = os.getenv("HOST", config.HOST)
    
    logger.info(f"Starting server on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,  # Disable reload in production
        log_level=config.LOG_LEVEL.lower(),
    )