# backend/app/security/user_store.py

from typing import Dict, Optional
from passlib.context import CryptContext
import logging

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class InMemoryUserStore:
    def __init__(self):
        # Initialize with hardcoded users for testing
        # These are the same credentials used in the database setup
        # Password: AFINasahbi@-11
        admin_hash = "$2b$12$rj.5hVBIXAGFIBh6/1AMk.vFdBJLE8KnYwh.vh1NU6Qb1ku/g0Xn6"
        hamza_hash = "$2b$12$rj.5hVBIXAGFIBh6/1AMk.vFdBJLE8KnYwh.vh1NU6Qb1ku/g0Xn6"
        
        self.users = {
            "admin": {
                "id": 1,
                "username": "admin",
                "password_hash": admin_hash
            },
            "hamza": {
                "id": 2,
                "username": "hamza",
                "password_hash": hamza_hash
            }
        }
    
    async def get_user(self, username: str) -> Optional[Dict]:
        # Simply return the user from the in-memory dictionary
        # No database connection required
        return self.users.get(username)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

# Create a singleton instance
user_store = InMemoryUserStore()
