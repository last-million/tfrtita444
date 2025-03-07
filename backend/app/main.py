from fastapi import FastAPI, Request, HTTPException, status, Body, Depends, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
import traceback
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Import route modules
from .routes import auth, health, calls, credentials, dashboard, knowledge_base

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api_debug.log")
    ]
)
logger = logging.getLogger("main")

# Create FastAPI app with detailed documentation
app = FastAPI(
    title="Voice Call AI API",
    description="API for Voice Call AI application with fixed auth",
    version="1.0.0"
)

# Mount routers from route modules
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(credentials.router, prefix="/api/credentials", tags=["credentials"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(knowledge_base.router, prefix="/api/knowledge", tags=["knowledge_base"])

# CORS middleware setup - Allow all origins to fix cross-domain issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# --- Request logging middleware ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests and responses for debugging"""
    request_id = f"{datetime.utcnow().timestamp()}-{hash(request)}"
    client_host = request.client.host if request.client else "unknown"
    
    logger.info(f"[{request_id}] Request: {request.method} {request.url.path} from {client_host}")
    logger.debug(f"[{request_id}] Headers: {dict(request.headers)}")
    
    try:
        # Process the request
        response = await call_next(request)
        
        # Log response status
        logger.info(f"[{request_id}] Response: {response.status_code}")
        return response
    except Exception as e:
        # Log any unhandled exceptions
        logger.error(f"[{request_id}] Unhandled error: {str(e)}")
        logger.debug(f"[{request_id}] Traceback: {traceback.format_exc()}")
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# --- Error handling for common issues ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom handler for HTTP exceptions with detailed logging"""
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Global exception handler with detailed logging"""
    logger.error(f"Unhandled exception: {str(exc)}")
    logger.debug(f"Traceback: {traceback.format_exc()}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": f"Internal server error: {str(exc)}"}
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Voice Call AI API is running",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

# Health check endpoint
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ----- DASHBOARD ENDPOINTS -----

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    logger.info("Fetching dashboard stats")
    # Mock data that matches what the frontend expects
    return {
        "totalCalls": 25,
        "activeServices": 2,
        "knowledgeBaseDocuments": 14,
        "aiResponseAccuracy": "92%"
    }

@app.get("/api/dashboard/recent-activities")
async def get_recent_activities():
    """Get recent dashboard activities"""
    logger.info("Fetching recent activities")
    # Mock data for recent activities
    return [
        {
            "id": "call_123456",
            "type": "Call",
            "description": "Outbound call to +1234567890",
            "timestamp": "2 hours ago"
        },
        {
            "id": "doc_789012",
            "type": "Document",
            "description": "Vectorized \"Product Manual.pdf\"",
            "timestamp": "3 hours ago"
        },
        {
            "id": "call_345678",
            "type": "Call",
            "description": "Inbound call from +0987654321",
            "timestamp": "1 day ago"
        }
    ]

# Also support the incorrect paths for dashboard endpoints
@app.get("/api/api/dashboard/stats")
async def get_dashboard_stats_alt_path():
    """Handle the incorrect double /api/api/ path for dashboard stats"""
    logger.info("Fetching dashboard stats (alt path)")
    return await get_dashboard_stats()

@app.get("/api/api/dashboard/recent-activities")
async def get_recent_activities_alt_path():
    """Handle the incorrect double /api/api/ path for recent activities"""
    logger.info("Fetching recent activities (alt path)")
    return await get_recent_activities()

# ----- CREDENTIAL STATUS ENDPOINTS (implemented in routes/credentials.py) -----

# Add fallback credential status endpoints in main.py for redundancy
@app.get("/api/credentials/status/{service}")
async def get_service_status(service: str):
    """Get the status of a service integration - direct implementation fallback"""
    logger.info(f"[FALLBACK ENDPOINT] Checking status for service: {service}")
    
    try:
        # This is a hardcoded list for dev/test environments
        services_connected = {
            "Twilio": True,
            "Supabase": True,
            "Google Calendar": True,
            "Ultravox": True,
            "SERP API": True,
            "Airtable": True,
            "Gmail": True,
            "Google Drive": True
        }
        
        is_connected = services_connected.get(service, False)
        
        # Return the status with more complete info the frontend expects
        return {
            "service": service,
            "connected": is_connected,
            "status": "configured" if is_connected else "not_configured",
            "message": f"{service} is {'successfully configured' if is_connected else 'not configured'}",
            "last_checked": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in fallback service status for {service}: {str(e)}")
        # Return a 200 with connected=false rather than an error
        return {
            "service": service,
            "connected": False,
            "status": "error",
            "message": f"Error checking {service} connection",
            "error": str(e),
            "last_checked": datetime.utcnow().isoformat()
        }

@app.get("/api/api/credentials/status/{service}")
async def get_service_status_alt_path(service: str):
    """Handle the incorrect double /api/api/ path - direct implementation fallback"""
    logger.info(f"[FALLBACK ALT PATH] Checking status for service: {service}")
    return await get_service_status(service)

# ----- CALL ENDPOINTS -----

class CallRequest(BaseModel):
    to: str
    from_number: Optional[str] = None
    message: Optional[str] = None

@app.post("/api/calls/initiate")
async def initiate_call(call_data: Dict[str, Any] = Body(...)):
    """Initiate a call using Twilio"""
    try:
        logger.info(f"Call initiation request: {call_data}")
        to_number = call_data.get("to")
        from_number = call_data.get("from", "+12345678901")  # Default from number
        
        if not to_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing 'to' number"
            )
        
        # Mock successful call response
        call_id = f"CA{hash(to_number) % 10000000000}"
        return {
            "call_id": call_id,
            "status": "queued",
            "message": f"Call to {to_number} has been queued",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.exception(f"Call initiation error: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate call: {str(e)}"
        )

# Also handle the path that might have /api/api prefix
@app.post("/api/api/calls/initiate")
async def initiate_call_alt_path(call_data: Dict[str, Any] = Body(...)):
    """Handle calls with incorrect double /api/api/ path"""
    return await initiate_call(call_data)

# ----- CALL HISTORY ENDPOINTS -----

@app.get("/api/calls/history")
async def get_call_history():
    """Get call history"""
    # Mock call history
    history = []
    return {
        "calls": history,
        "pagination": {
            "page": 1,
            "limit": 10,
            "total": 0,
            "pages": 0
        }
    }

# Also handle the alternative path
@app.get("/api/api/calls/history")
async def get_call_history_alt_path():
    """Handle call history with incorrect double /api/api/ path"""
    return await get_call_history()

# ----- KNOWLEDGE BASE ENDPOINTS -----

@app.get("/api/knowledge/documents")
async def get_knowledge_documents():
    """Get knowledge base documents"""
    # Mock empty document list
    return {
        "documents": [],
        "pagination": {
            "page": 1,
            "limit": 10,
            "total": 0,
            "pages": 0
        }
    }

# Also handle alternative path
@app.get("/api/api/knowledge/documents")
async def get_knowledge_documents_alt_path():
    """Handle knowledge documents with incorrect double /api/api/ path"""
    return await get_knowledge_documents()
