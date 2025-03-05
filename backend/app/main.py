from fastapi import FastAPI, Request, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("main")

# Create FastAPI app
app = FastAPI(
    title="Voice Call AI API",
    description="API for Voice Call AI application",
    version="1.0.0"
)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT configuration
SECRET_KEY = "strong-secret-key-for-jwt-tokens"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Direct auth token endpoint with debugging logs
@app.post("/api/auth/token")
async def login_for_access_token(request: Request):
    try:
        logger.info(f"Auth token request received with content type: {request.headers.get('content-type')}")
        username = None
        password = None
        
        content_type = request.headers.get('content-type', '')
        
        if 'application/json' in content_type:
            # Handle JSON data
            json_data = await request.json()
            username = json_data.get('username')
            password = json_data.get('password')
            logger.info(f"Received JSON login request for user: {username}")
            
        elif 'application/x-www-form-urlencoded' in content_type or 'multipart/form-data' in content_type:
            # Handle form data
            form_data = await request.form()
            username = form_data.get('username')
            password = form_data.get('password')
            logger.info(f"Received form login request for user: {username}")
            
        else:
            # Try to handle raw body
            body = await request.body()
            try:
                body_text = body.decode('utf-8')
                logger.info(f"Raw request body: {body_text[:100]}")
                
                # Try to extract username and password
                if '&' in body_text:
                    params = {}
                    for param in body_text.split('&'):
                        if '=' in param:
                            key, value = param.split('=', 1)
                            params[key] = value
                    
                    username = params.get('username')
                    password = params.get('password')
                    logger.info(f"Extracted from raw body: username={username}")
            except Exception as e:
                logger.error(f"Failed to parse request body: {str(e)}")
        
        # Hardcoded credentials for simple testing
        if not username or not password:
            logger.error("Username or password missing")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username and password required"
            )
            
        if username != "hamza" or password != "AFINasahbi@-11":
            logger.error(f"Invalid credentials for user: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        
        # Generate token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )
        
        # Return success response
        logger.info(f"Login successful for user: {username}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": username
        }
        
    except Exception as e:
        logger.exception(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server error: {str(e)}"
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

# ----- CREDENTIAL STATUS ENDPOINTS -----

# Add service status endpoint - FIXING THE DOUBLE /api/api/ PATH ISSUE
@app.get("/api/credentials/status/{service}")
async def get_service_status(service: str):
    """Get the status of a service integration"""
    logger.info(f"Checking status for service: {service}")
    
    # Mock response for service status
    return {
        "service": service,
        "status": "not_configured",
        "message": f"{service} is not yet configured",
        "last_checked": datetime.utcnow().isoformat()
    }

# Also support the incorrect path that the frontend might be using
@app.get("/api/api/credentials/status/{service}")
async def get_service_status_alt_path(service: str):
    """Handle the incorrect double /api/api/ path"""
    logger.info(f"Checking status for service (alt path): {service}")
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
