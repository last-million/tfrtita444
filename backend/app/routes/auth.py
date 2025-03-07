from fastapi import APIRouter, HTTPException, status, Depends, Header, Request, Form, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging
import json

from ..config import settings
from ..security.password import verify_password

# Configure detailed logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("auth")

router = APIRouter()

# Load JWT configuration from settings
SECRET_KEY = settings.jwt_secret
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: Optional[str] = None

class UserResponse(BaseModel):
    username: str
    is_admin: bool

def create_access_token(data: dict, expires_delta: int = ACCESS_TOKEN_EXPIRE_MINUTES):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_delta)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if the user exists (in a real app, this would query the database)
        if username != "hamza":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return {"username": username, "is_admin": username == "hamza"}
        
    except (ValueError, JWTError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(request: Request):
    """Enhanced login endpoint that handles various content types and provides detailed logging"""
    try:
        logger.info(f"Auth token request received: {request.headers.get('content-type')}")
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
            # Try to handle raw body as last resort
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
                elif body_text.startswith('{'):
                    # Try to parse as JSON
                    try:
                        json_data = json.loads(body_text)
                        username = json_data.get('username')
                        password = json_data.get('password')
                        logger.info(f"Parsed JSON from raw body for user: {username}")
                    except json.JSONDecodeError:
                        logger.error("Failed to parse JSON from body")
            except Exception as e:
                logger.error(f"Failed to parse request body: {str(e)}")
                logger.debug(f"Raw body: {body}")
        
        # Logging all request data for debugging
        logger.info(f"Request headers: {dict(request.headers)}")
        logger.info(f"Username extracted: {username}")
        
        # Hardcoded credentials check
        if not username or not password:
            logger.error("Username or password missing")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username and password required"
            )
            
        # Always accept these hardcoded credentials (for testing)
        valid_credentials = (
            (username == "hamza" and password == "AFINasahbi@-11") or
            (username == "admin" and password == "AFINasahbi@-11")
        )
        
        if not valid_credentials:
            logger.error(f"Invalid credentials for user: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Generate token with extended expiration for testing
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES * 10)  # 10x longer for testing
        access_token = create_access_token(
            data={"sub": username}, expires_delta=ACCESS_TOKEN_EXPIRE_MINUTES
        )
        
        # Return success response
        logger.info(f"Login successful for user: {username}")
        return JSONResponse(content={
            "access_token": access_token,
            "token_type": "bearer",
            "username": username
        })
        
    except HTTPException as he:
        # Re-raise HTTP exceptions as-is
        raise he
    except Exception as e:
        # Log and convert other exceptions to 500 errors
        logger.exception(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server error: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "is_admin": current_user["is_admin"]
    }
