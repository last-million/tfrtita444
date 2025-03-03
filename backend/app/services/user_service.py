from passlib.context import CryptContext
from ..database import db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def get_user_from_db(username: str) -> dict:
    query = "SELECT username, password_hash FROM users WHERE username = %s"
    result = await db.execute(query, (username,))
    return result[0] if result else None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
