from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv
import logging
from contextlib import asynccontextmanager

# Import services
from services.summarization import SummarizationService
from services.priority_analyzer import PriorityAnalyzer
from services.completeness_checker import CompletenessChecker
from services.performance_insights import PerformanceInsightsService
from services.text_extractor import TextExtractorService
from services.model_manager import ModelManager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global services
services = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting AI Service...")
    
    # Initialize model manager for on-demand loading
    model_manager = ModelManager()
    
    # Initialize services with model manager
    services['summarization'] = SummarizationService(model_manager)
    services['priority_analyzer'] = PriorityAnalyzer()
    services['completeness_checker'] = CompletenessChecker()
    services['performance_insights'] = PerformanceInsightsService()
    services['text_extractor'] = TextExtractorService()
    
    logger.info("✅ AI Service started successfully!")
    logger.info("📝 Models will be loaded on-demand to save memory")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down AI Service...")
    
    # Clean up models
    if 'model_manager' in locals():
        await model_manager.cleanup_all()

# Create FastAPI app
app = FastAPI(
    title="AI Task Management Service",
    description="AI-powered microservice for task management system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class SummarizeRequest(BaseModel):
    text: str
    max_length: Optional[int] = 150

class SummarizeResponse(BaseModel):
    summary: str
    original_length: int
    summary_length: int

class AnalyzePriorityRequest(BaseModel):
    title: str
    description: str

class AnalyzePriorityResponse(BaseModel):
    priority: int
    reasoning: str
    confidence: float

class CheckCompletenessRequest(BaseModel):
    description: str
    goals: str
    phase: str

class CheckCompletenessResponse(BaseModel):
    completeness_score: float
    suggestions: List[str]
    is_complete: bool

class PerformanceInsightsRequest(BaseModel):
    analytics: Dict[str, Any]

class PerformanceInsightsResponse(BaseModel):
    insights: List[str]
    recommendations: List[str]
    trends: List[str]

class ExtractTextRequest(BaseModel):
    file_path: str
    mime_type: str

class ExtractTextResponse(BaseModel):
    extracted_text: str
    confidence: Optional[float] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    models_loaded: Dict[str, bool]

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    from datetime import datetime
    import psutil
    import os
    
    try:
        # Get memory usage
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        logger.info(f"Memory usage: {memory_mb:.2f} MB")
        
        models_status = {
            "summarization": services.get('summarization') is not None,
            "priority_analyzer": services.get('priority_analyzer') is not None,
            "completeness_checker": services.get('completeness_checker') is not None,
            "performance_insights": services.get('performance_insights') is not None,
            "text_extractor": services.get('text_extractor') is not None,
        }
        
        # Check if memory usage is too high
        status = "healthy"
        if memory_mb > 400:  # 400MB threshold
            status = "degraded"
            logger.warning(f"High memory usage: {memory_mb:.2f} MB")
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            models_loaded=models_status
        )
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return HealthResponse(
            status="unhealthy",
            timestamp=datetime.utcnow().isoformat(),
            models_loaded={}
        )

# Summarization endpoint
@app.post("/summarize", response_model=SummarizeResponse)
async def summarize_text(request: SummarizeRequest):
    try:
        logger.info(f"Summarization request received: {len(request.text)} characters")
        
        summarization_service = services.get('summarization')
        if not summarization_service:
            logger.error("Summarization service not available")
            raise HTTPException(status_code=503, detail="Summarization service not available")
        
        # Load model on-demand if not already loaded
        if not summarization_service.model_loaded:
            logger.info("Loading summarization model on-demand...")
            await summarization_service.load_model()
        
        summary = await summarization_service.summarize(request.text, request.max_length)
        
        logger.info(f"Summarization completed: {len(summary)} characters")
        return SummarizeResponse(
            summary=summary,
            original_length=len(request.text),
            summary_length=len(summary)
        )
    except Exception as e:
        logger.error(f"Error in summarization: {str(e)}")
        # Return fallback summary instead of failing
        fallback_summary = request.text[:request.max_length] + "..." if len(request.text) > request.max_length else request.text
        return SummarizeResponse(
            summary=fallback_summary,
            original_length=len(request.text),
            summary_length=len(fallback_summary)
        )

# Priority analysis endpoint
@app.post("/analyze-priority", response_model=AnalyzePriorityResponse)
async def analyze_priority(request: AnalyzePriorityRequest):
    try:
        priority_analyzer = services.get('priority_analyzer')
        if not priority_analyzer:
            raise HTTPException(status_code=503, detail="Priority analyzer service not available")
        
        result = await priority_analyzer.analyze(request.title, request.description)
        
        return AnalyzePriorityResponse(**result)
    except Exception as e:
        logger.error(f"Error in priority analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Priority analysis failed: {str(e)}")

# Completeness check endpoint
@app.post("/check-completeness", response_model=CheckCompletenessResponse)
async def check_completeness(request: CheckCompletenessRequest):
    try:
        completeness_checker = services.get('completeness_checker')
        if not completeness_checker:
            raise HTTPException(status_code=503, detail="Completeness checker service not available")
        
        result = await completeness_checker.check(
            request.description, 
            request.goals, 
            request.phase
        )
        
        return CheckCompletenessResponse(**result)
    except Exception as e:
        logger.error(f"Error in completeness check: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Completeness check failed: {str(e)}")

# Performance insights endpoint
@app.post("/performance-insights", response_model=PerformanceInsightsResponse)
async def generate_performance_insights(request: PerformanceInsightsRequest):
    try:
        insights_service = services.get('performance_insights')
        if not insights_service:
            raise HTTPException(status_code=503, detail="Performance insights service not available")
        
        result = await insights_service.generate_insights(request.analytics)
        
        return PerformanceInsightsResponse(**result)
    except Exception as e:
        logger.error(f"Error in performance insights: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Performance insights failed: {str(e)}")

# Text extraction endpoint
@app.post("/extract-text", response_model=ExtractTextResponse)
async def extract_text(request: ExtractTextRequest):
    try:
        text_extractor = services.get('text_extractor')
        if not text_extractor:
            raise HTTPException(status_code=503, detail="Text extractor service not available")
        
        result = await text_extractor.extract(request.file_path, request.mime_type)
        
        return ExtractTextResponse(**result)
    except Exception as e:
        logger.error(f"Error in text extraction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "AI Task Management Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "summarize": "/summarize",
            "analyze_priority": "/analyze-priority",
            "check_completeness": "/check-completeness",
            "performance_insights": "/performance-insights",
            "extract_text": "/extract-text"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8001)),
        reload=os.getenv("ENVIRONMENT") == "development"
    )
