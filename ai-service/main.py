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
    
    # Initialize services
    services['summarization'] = SummarizationService()
    services['priority_analyzer'] = PriorityAnalyzer()
    services['completeness_checker'] = CompletenessChecker()
    services['performance_insights'] = PerformanceInsightsService()
    services['text_extractor'] = TextExtractorService()
    
    # Load models
    await services['summarization'].load_model()
    await services['priority_analyzer'].load_model()
    
    logger.info("✅ AI Service started successfully!")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down AI Service...")

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
    
    models_status = {
        "summarization": services.get('summarization') is not None,
        "priority_analyzer": services.get('priority_analyzer') is not None,
        "completeness_checker": services.get('completeness_checker') is not None,
        "performance_insights": services.get('performance_insights') is not None,
        "text_extractor": services.get('text_extractor') is not None,
    }
    
    return HealthResponse(
        status="healthy" if all(models_status.values()) else "degraded",
        timestamp=datetime.utcnow().isoformat(),
        models_loaded=models_status
    )

# Summarization endpoint
@app.post("/summarize", response_model=SummarizeResponse)
async def summarize_text(request: SummarizeRequest):
    try:
        summarization_service = services.get('summarization')
        if not summarization_service:
            raise HTTPException(status_code=503, detail="Summarization service not available")
        
        summary = await summarization_service.summarize(request.text, request.max_length)
        
        return SummarizeResponse(
            summary=summary,
            original_length=len(request.text),
            summary_length=len(summary)
        )
    except Exception as e:
        logger.error(f"Error in summarization: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")

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
