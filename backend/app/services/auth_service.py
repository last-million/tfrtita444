import logging
from fastapi import HTTPException, status
from passlib.context import CryptContext
from ..security.user_store import user_store
from ..utils.error_handler import AuthenticationError

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def authenticate_user(username: str, password: str):
    try:
        # Use the in-memory user store instead of database
        user = await user_store.get_user(username)
        
        if not user:
            raise AuthenticationError(
                message="Invalid credentials",
                details={"headers": {"WWW-Authenticate": "Bearer"}}
            )
        
        if not user_store.verify_password(password, user['password_hash']):
            raise AuthenticationError(
                message="Invalid credentials",
                details={"headers": {"WWW-Authenticate": "Bearer"}}
            )
        
        return user
    except AuthenticationError:
        # Re-raise authentication errors
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during authentication"
        )
