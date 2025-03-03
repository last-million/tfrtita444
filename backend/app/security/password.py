# backend/app/security/password.py

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    """
    Hash a plaintext password using bcrypt via passlib.
    """
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plaintext password against a stored (hashed) password.
    """
    return pwd_context.verify(plain, hashed)
