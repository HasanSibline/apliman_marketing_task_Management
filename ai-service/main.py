from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging
from datetime import datetime
import psutil
import os
import asyncio
from config import get_config
from services.content_generator import ContentGenerator
from services.web_scraper import WebScraper
from services.chat_service import ChatService
from services.priority_analyzer import PriorityAnalyzer
from services.completeness_checker import CompletenessChecker
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import traceback

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

# Configure CORS - restrict to backend origin only
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Auth helper ──────────────────────────────────────────────────────────────
_bearer_scheme = HTTPBearer(auto_error=False)

_LOCAL_DEV_ENVIRONMENTS = {"development", "testing"}

def require_service_token(
    credentials: HTTPAuthorizationCredentials = Security(_bearer_scheme),
):
    """Validate the AI_SERVICE_SECRET bearer token on protected endpoints."""
    expected = os.getenv("AI_SERVICE_SECRET", "")
    if not expected:
        if config.ENVIRONMENT in _LOCAL_DEV_ENVIRONMENTS:
            # Convenience for `npm run dev`, where nobody wants to set a shared secret.
            logger.warning("AI_SERVICE_SECRET is not set; endpoint is unauthenticated (dev only)")
            return
        # Fail closed. A missing or misspelled secret in production would otherwise
        # silently turn every protected endpoint into a public one.
        logger.error("AI_SERVICE_SECRET is not set; refusing requests")
        raise HTTPException(
            status_code=503,
            detail="AI service is misconfigured: AI_SERVICE_SECRET is not set.",
        )
    if credentials is None or credentials.credentials != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing service token")

# Initialize services
content_generator = ContentGenerator()
web_scraper = WebScraper()
# Both hold nothing per-request, so one instance each is shared. Neither touches an
# API key, so unlike ContentGenerator they are not rebuilt per company.
priority_analyzer = PriorityAnalyzer()
completeness_checker = CompletenessChecker()


def with_usage(payload: Dict[str, Any], usage: Optional[Dict[str, int]]) -> Dict[str, Any]:
    """Attach the provider's token counts to a response, or leave the key off.

    The backend prices a call from `usage` when it is there and from its own estimate
    when it is not, so a provider that reported nothing must send nothing. Zeros would
    be worse than silence: the backend would have to read them as a call that cost
    nothing, and no call costs nothing.
    """
    if usage:
        payload["usage"] = usage
    return payload


def resolve_api_key(provided_key: str | None, endpoint_name: str) -> str:
    """
    Multi-tenant key resolver.
    Uses ONLY the company-specific key passed per-request from NestJS.
    There are NO environment/platform key fallbacks, a company that has not been
    assigned a key via the admin panel cannot use AI.
    """
    if provided_key and provided_key.strip():
        # A company may store multiple comma-separated keys for chat failover; the
        # single-shot endpoints just use the first one.
        first = provided_key.split(",")[0].strip()
        logger.info(f"[{endpoint_name}] Using company-provided API key")
        return first
    raise HTTPException(
        status_code=400,
        detail="AI is not configured for your company. Please contact your administrator to add an AI API key."
    )

def resolve_api_key_pool(provided_key: str | None, endpoint_name: str, provider: str = "gemini") -> list:
    """
    Build a pool of API keys from the company-provided key(s) ONLY.
    A comma-separated value is supported so a company can supply multiple of its
    OWN keys for rotation. No environment/platform keys are ever added.
    """
    pool = []

    # Company key(s) from the per-request payload, the only source of keys.
    if provided_key and provided_key.strip():
        for k in provided_key.split(","):
            k = k.strip()
            if k:
                pool.append(k)

    if not pool:
        raise HTTPException(
            status_code=400,
            detail="AI is not configured for your company. Please contact your administrator to add an AI API key."
        )

    logger.info(f"[{endpoint_name}] Key pool built: {len(pool)} company key(s) available for rotation")
    return pool

@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    try:
        # Get system metrics
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        # NOTE: We do NOT run a live AI generation here. AI keys are per-company and
        # supplied per-request, so the service being up == healthy. Per-key validity is
        # checked at request time using the calling company's own key.
        provider_status = {
            "ai_provider": "gemini",
            "gemini_status": "ready",
            "gemini_model": config.GEMINI_MODEL,
            "gemini_error": None,
            "key_source": "per-company (no environment keys used)",
        }

        return {
            "status": "healthy",
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

@app.get("/api-keys-status", dependencies=[Depends(require_service_token)])
async def api_keys_status():
    """Report whether environment API keys are configured.

    Deliberately does no network I/O and returns no key material. This used to make a
    live Gemini call per key and echo a key prefix, which let anyone with the public
    URL burn provider quota and learn part of a credential.
    """
    try:
        api_keys = config.get_api_keys()
        return {
            "status": "ok" if api_keys else "not_configured",
            "keys_count": len(api_keys),
        }
    except Exception as e:
        logger.error(f"Error checking API keys status: {e}")
        return {
            "status": "error",
            "message": "Unable to read API key configuration",
        }


class TestAiRequest(BaseModel):
    api_key: str
    provider: Optional[str] = "gemini"
    model: Optional[str] = None
    text: Optional[str] = "Reply with the single word: ready"


@app.post("/test-ai", dependencies=[Depends(require_service_token)])
async def test_ai(request: TestAiRequest):
    """Verify one API key with a single live call.

    Used by the super-admin panel to confirm a key works before handing the app to
    users, so it deliberately makes the cheapest possible request rather than
    generating a full task.
    """
    try:
        generator = ContentGenerator(request.api_key, provider=request.provider, model=request.model)
        reply, _usage = await generator._make_request(request.text)

        return with_usage({
            "status": "success",
            "timestamp": datetime.utcnow().isoformat(),
            "ai_provider": generator.provider,
            "model": generator.model,
            "reply": (reply or "").strip()[:200],
        }, generator.usage_report())
    except Exception as e:
        logger.error(f"AI test failed: {e}")
        raise HTTPException(
            status_code=502,
            detail={
                "status": "error",
                "message": str(e),
                "ai_provider": request.provider,
            },
        )

class GenerateContentRequest(BaseModel):
    title: str
    type: str = "task"
    knowledge_sources: Optional[List[dict]] = None  # Optional knowledge sources
    company_name: Optional[str] = None  # Company name for personalized AI responses
    api_key: Optional[str] = None  # Company-specific API key
    provider: Optional[str] = "gemini"  # Selected AI provider
    model: Optional[str] = None  # Optional model override (set by the platform key)

class ScrapeUrlRequest(BaseModel):
    url: str

@app.post("/generate-content", dependencies=[Depends(require_service_token)])
async def generate_content(request: GenerateContentRequest):
    """Generate content using configured AI provider with optional knowledge sources"""
    try:
        api_key_to_use = resolve_api_key(request.api_key, "generate-content")
        temp_generator = ContentGenerator(api_key_to_use, provider=request.provider, model=request.model)
        
        # Set knowledge sources if provided
        if request.knowledge_sources:
            temp_generator.set_knowledge_sources(request.knowledge_sources)
        
        # Set company name if provided
        if request.company_name:
            temp_generator.set_company_name(request.company_name)
        
        # Generate content
        description = await temp_generator.generate_description(request.title)
        goals = await temp_generator.generate_goals(request.title)
        priority = await temp_generator.analyze_priority(request.title, description)
        
        # Three provider calls above, one response here, so the counts are the sum of
        # all three rather than the last one.
        return with_usage({
            "ai_provider": temp_generator.provider,
            "model": temp_generator.model,
            "description": description,
            "goals": goals,
            "priority": priority
        }, temp_generator.usage_report())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI content generation failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"{str(e)}"
            }
        )

class SummarizeRequest(BaseModel):
    text: str
    max_length: int = 150
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"
    model: Optional[str] = None  # Optional model override (set by the platform key)

@app.post("/summarize", dependencies=[Depends(require_service_token)])
async def summarize(request: SummarizeRequest):
    """Summarize text using configured AI provider"""
    try:
        api_key_to_use = resolve_api_key(request.api_key, "summarize")
        temp_generator = ContentGenerator(api_key_to_use, provider=request.provider, model=request.model)
        summary = await temp_generator.summarize_text(request.text, request.max_length)
        return with_usage({"summary": summary}, temp_generator.usage_report())
    except Exception as e:
        logger.error(f"Summarization failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class DailyBriefRequest(BaseModel):
    firstName: str = "there"
    facts: str
    max_length: int = 400
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"
    model: Optional[str] = None

@app.post("/daily-brief", dependencies=[Depends(require_service_token)])
async def daily_brief(request: DailyBriefRequest):
    """
    Write a person's daily brief from counts the backend has already established.

    Separate from /summarize because the two want opposite things from their input:
    summarize treats its text as material to condense, so instructions sent to it come
    back condensed rather than followed. This one carries its own prompt and takes only
    facts.
    """
    try:
        api_key_to_use = resolve_api_key(request.api_key, "daily-brief")
        generator = ContentGenerator(api_key_to_use, provider=request.provider, model=request.model)
        brief = await generator.write_daily_brief(request.firstName, request.facts, request.max_length)
        return with_usage({"brief": brief}, generator.usage_report())
    except Exception as e:
        logger.error(f"Daily brief failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class TicketCheckRequest(BaseModel):
    draftTitle: str
    facts: str
    max_length: int = 320
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"
    model: Optional[str] = None

@app.post("/ticket-check", dependencies=[Depends(require_service_token)])
async def ticket_check(request: TicketCheckRequest):
    """
    Phrase what the backend already worked out about a ticket somebody is drafting.

    The duplicate matching is done in the backend and its results arrive as facts. This
    only writes them up, so a wrong number cannot be produced here.
    """
    try:
        api_key_to_use = resolve_api_key(request.api_key, "ticket-check")
        generator = ContentGenerator(api_key_to_use, provider=request.provider, model=request.model)
        note = await generator.write_ticket_note(request.draftTitle, request.facts, request.max_length)
        return with_usage({"note": note}, generator.usage_report())
    except Exception as e:
        logger.error(f"Ticket check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scrape-url", dependencies=[Depends(require_service_token)])
async def scrape_url(request: ScrapeUrlRequest):
    """Scrape content from a URL"""
    try:
        result = await web_scraper.scrape_url(request.url)
        return result
    except Exception as e:
        logger.error(f"URL scraping failed: {str(e)}")
        logger.error(traceback.format_exc())
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
    user: Dict[str, Any]  # Added missing user field
    companyName: Optional[str] = None
    conversationHistory: List[dict] = []
    knowledgeSources: List[dict] = []
    additionalContext: Dict[str, Any] = {}
    isDeepAnalysis: bool = False
    api_key: Optional[str] = None  # Company-specific API key
    provider: Optional[str] = "gemini"  # Selected AI provider
    model: Optional[str] = None  # Optional model override (set by the platform key)
    files: Optional[List[Any]] = None # Use Any to avoid strict Pydantic dictionary validation if something weird is sent
    userToken: Optional[str] = None # User's access token for file fetching

@app.post("/chat", dependencies=[Depends(require_service_token)])
async def chat(request: ChatRequest):
    """Process chat message with Aura Assist"""
    try:
        api_key_pool = resolve_api_key_pool(request.api_key, "chat", provider=request.provider)
        temp_chat_service = ChatService(api_key_pool, provider=request.provider, model=request.model)
        
        # Process chat message (now async)
        result = await temp_chat_service.process_chat_message(
            message=request.message,
            user_context=request.userContext,
            user=request.user,
            conversation_history=request.conversationHistory,
            knowledge_sources=request.knowledgeSources,
            additional_context=request.additionalContext,
            is_deep_analysis=request.isDeepAnalysis,
            company_name=request.companyName,
            files=request.files, # Pass files here
            user_token=request.userToken # Pass user token
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat processing failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": str(e)
            }
        )

@app.post("/detect-task-type", dependencies=[Depends(require_service_token)])
async def detect_task_type(request: dict):
    """Detect task type from title"""
    try:
        title = request.get("title", "")
        api_key = request.get("api_key", None)
        
        if not title:
            raise HTTPException(status_code=400, detail="Title required")
        
        api_key_to_use = resolve_api_key(api_key, "detect-task-type")
        provider = request.get("provider", "gemini")
        temp_generator = ContentGenerator(api_key_to_use, provider=provider, model=request.get("model"))
        task_type = await temp_generator.detect_task_type(title)
        
        return with_usage({
            "task_type": task_type,
            "ai_provider": "gemini",
            "gemini_model": config.GEMINI_MODEL
        }, temp_generator.usage_report())
    except Exception as e:
        logger.error(f"Task type detection failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-subtasks", dependencies=[Depends(require_service_token)])
async def generate_subtasks(request: dict):
    """Generate intelligent subtasks"""
    try:
        title = request.get("title", "")
        description = request.get("description", "")
        task_type = request.get("taskType", "GENERAL")
        workflow_phases = request.get("workflowPhases", [])
        available_users = request.get("availableUsers", [])
        knowledge_sources = request.get("knowledgeSources", None)
        api_key = request.get("api_key", None)
        company_name = request.get("company_name", None)
        
        if not title:
            raise HTTPException(status_code=400, detail="Title required")
        
        api_key_to_use = resolve_api_key(api_key, "generate-subtasks")
        provider = request.get('provider', 'gemini')
        temp_generator = ContentGenerator(api_key_to_use, provider=provider, model=request.get("model"))
        
        # Set knowledge sources if provided
        if knowledge_sources:
            temp_generator.set_knowledge_sources(knowledge_sources)
        
        # Set company name if provided
        if company_name:
            temp_generator.set_company_name(company_name)
        
        subtasks = await temp_generator.generate_subtasks(
            title, task_type, description, workflow_phases, available_users
        )
        
        return with_usage({
            "ai_provider": "gemini",
            "gemini_model": config.GEMINI_MODEL,
            "subtasks": subtasks
        }, temp_generator.usage_report())
    except Exception as e:
        logger.error(f"Subtask generation failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzePriorityRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    company_name: Optional[str] = None  # Sent by the gateway with every call; unused here
    api_key: Optional[str] = None  # Company-specific API key
    provider: Optional[str] = "gemini"  # Selected AI provider
    model: Optional[str] = None  # Optional model override (set by the platform key)

@app.post("/analyze-priority", dependencies=[Depends(require_service_token)])
async def analyze_priority(request: AnalyzePriorityRequest):
    """Suggest a priority level for a task, and say why.

    The provider does the judging and PriorityAnalyzer only reads its answer. That split
    matters because the backend routes this endpoint through the provider chain: a
    failure has to arrive there as a provider failure so the chain can fail over. If this
    caught a dead key and returned the local keyword score instead, every call would look
    like a success and the chain would never learn the key was dead.
    """
    try:
        if not request.title:
            raise HTTPException(status_code=400, detail="Title required")

        api_key_to_use = resolve_api_key(request.api_key, "analyze-priority")
        temp_generator = ContentGenerator(api_key_to_use, provider=request.provider, model=request.model)

        description = request.description or ""
        prompt = f"""
        Rate the priority of this task on a scale of 1 to 5.

        Title: {request.title}
        Description: {description}

        Weigh how urgent it is, how much other work waits on it, the impact of doing it,
        and how much it matters to the business.

        5 = critical, needs action now
        4 = high, important and on a short timeline
        3 = medium, the standard case
        2 = low, can be scheduled freely
        1 = minimal, nice to have

        Answer in exactly two lines and nothing else:
        Priority: <a single digit from 1 to 5>
        Reasoning: <one sentence saying why>
        """

        response, _usage = await temp_generator._make_request(prompt)
        result = priority_analyzer.parse_model_response(request.title, description, response)

        return with_usage({
            "suggested_priority": result["priority"],
            "reasoning": result["reasoning"],
            "confidence": result["confidence"],
            "ai_provider": temp_generator.provider,
            "model": temp_generator.model
        }, temp_generator.usage_report())
    except HTTPException:
        # A company with no key configured raises 400 above. Re-raised rather than
        # restated as a provider error below, because the chain reads 5xx as "try the
        # next provider" and there is no provider that fixes a missing key.
        raise
    except Exception as e:
        logger.error(f"Priority analysis failed: {str(e)}")
        logger.error(traceback.format_exc())
        # 502 with the provider's own words kept intact, so the backend's classifier in
        # ai-error.ts can still tell a rate limit from a revoked key. Never 404 or 405:
        # it reads those as this service being undeployed and stops the chain dead.
        raise HTTPException(
            status_code=502,
            detail={
                "status": "error",
                "message": str(e),
                "ai_provider": request.provider
            }
        )

class CheckCompletenessRequest(BaseModel):
    description: Optional[str] = ""
    goals: Optional[str] = ""
    phase: Optional[str] = ""  # The backend's TaskPhase enum, e.g. TODO or IN_PROGRESS
    company_name: Optional[str] = None  # Sent by the gateway with every call; unused here
    api_key: Optional[str] = None  # Company-specific API key
    provider: Optional[str] = "gemini"  # Selected AI provider
    model: Optional[str] = None  # Optional model override (set by the platform key)

@app.post("/check-completeness", dependencies=[Depends(require_service_token)])
async def check_completeness(request: CheckCompletenessRequest):
    """Score how well a task's description covers its goals for the phase it sits in.

    Scored locally with no provider call. The question is whether one piece of text
    covers another and whether a fixed per-phase checklist is met, which a model would
    answer more slowly, at a cost per task, and differently each time it was asked. The
    key is still resolved so that a company without AI configured is refused here in the
    same words as everywhere else, rather than this one endpoint quietly working while
    the rest of the assistant is switched off.
    """
    try:
        resolve_api_key(request.api_key, "check-completeness")

        result = await completeness_checker.check(
            request.description or "",
            request.goals or "",
            request.phase or ""
        )

        return {
            "completeness_score": result["completeness_score"],
            "suggestions": result["suggestions"],
            "is_complete": result["is_complete"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Completeness check failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/performance-insights", dependencies=[Depends(require_service_token)])
async def generate_performance_insights(request: dict):
    """Generate performance insights from analytics data"""
    try:
        analytics_data = request.get("analytics", {})
        api_key = request.get("api_key", None)
        
        api_key_to_use = resolve_api_key(api_key, "performance-insights")
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
        
        # Use temp generator for insight generation with company key
        provider = request.get("provider", "gemini")
        temp_generator = ContentGenerator(api_key_to_use, provider=provider, model=request.get("model"))
        response, _usage = await temp_generator._make_request(prompt)
        usage = temp_generator.usage_report()
        
        # Try to parse as JSON, fallback to structured response
        try:
            import json
            parsed_response = json.loads(response)
            return with_usage({
                "insights": parsed_response.get("insights", ["Performance analysis completed"]),
                "recommendations": parsed_response.get("recommendations", ["Continue monitoring performance"]),
                "trends": parsed_response.get("trends", ["Data analysis in progress"]),
                "ai_provider": "gemini"
            }, usage)
        except json.JSONDecodeError:
            # Fallback if response isn't valid JSON. The call was made and billed either
            # way, so the counts travel with the fallback shape too.
            return with_usage({
                "insights": [response[:200] + "..." if len(response) > 200 else response],
                "recommendations": ["Review the insights above for actionable steps"],
                "trends": ["Continue monitoring for patterns"],
                "ai_provider": "gemini"
            }, usage)
            
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
    api_key: Optional[str] = None  # Company-specific API key
    # Carried like every other endpoint. Without them this built a Gemini client and
    # handed it whichever key the company actually uses, so a company on Anthropic or
    # Groq could never learn anything.
    provider: Optional[str] = "gemini"
    model: Optional[str] = None

@app.post("/learn-from-tasks", dependencies=[Depends(require_service_token)])
async def learn_from_tasks(request: LearnFromTasksRequest):
    """Learn from user's task history to extract insights and patterns"""
    try:
        keys = resolve_api_key_pool(request.api_key, "learn-from-tasks", request.provider or "gemini")
        temp_chat_service = ChatService(keys, request.provider or "gemini", request.model)
        
        learned_context = await temp_chat_service.learn_from_task_history(
            user_context=request.userContext,
            completed_tasks=request.completedTasks,
            active_tasks=request.activeTasks
        )
        
        # ai_provider was hardcoded to gemini here and reported the wrong provider for
        # every company not on it.
        return with_usage({
            "success": True,
            "learnedContext": learned_context,
            "ai_provider": request.provider or "gemini"
        }, temp_chat_service.learning_usage_report())
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
    api_key: Optional[str] = None  # Company-specific API key
    provider: Optional[str] = "gemini"
    model: Optional[str] = None

@app.post("/learn-domain-interests", dependencies=[Depends(require_service_token)])
async def learn_domain_interests(request: LearnDomainInterestsRequest):
    """Learn what the user is interested in regarding specific domains"""
    try:
        keys = resolve_api_key_pool(request.api_key, "learn-domain-interests", request.provider or "gemini")
        temp_chat_service = ChatService(keys, request.provider or "gemini", request.model)
        
        learned_interests = await temp_chat_service.learn_about_domain_interests(
            domain_topic=request.domainTopic,
            user_questions=request.userQuestions,
            existing_knowledge=request.existingKnowledge
        )
        
        return with_usage({
            "success": True,
            "learnedInterests": learned_interests,
            "ai_provider": request.provider or "gemini"
        }, temp_chat_service.learning_usage_report())
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