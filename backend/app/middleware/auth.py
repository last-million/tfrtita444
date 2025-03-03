# backend/app/middleware/auth.py

from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from ..routes.auth import SECRET_KEY, ALGORITHM

security = HTTPBearer(auto_error=False)

async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    # Bypass authentication - always return a valid payload
    # This allows all requests to be authenticated without a token
    return {"sub": "default_user", "authenticated": True}
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
