from fastapi import APIRouter, HTTPException, status, Body
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import secrets
import smtplib
from email.mime.text import MIMEText

from ..database import db
from ..config import settings
from ..security.password import hash_password, verify_password  # example security helpers
# Example: from your existing user logic:
#   get_user_by_email(email: str)
#   update_user_password(user_id: int, hashed_pw: str)
#   store_reset_token(user_id: int, token: str, expires_at: datetime)
#   get_user_by_reset_token(token: str)
#   etc.

router = APIRouter()

RESET_TOKEN_EXPIRE_MINUTES = 30

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

@router.post("/request-reset", status_code=200)
async def request_password_reset(payload: PasswordResetRequest):
    """
    1) User enters their email in a 'forgot password' form.
    2) We generate a reset token, store it, then send an email with a link.
    """
    # 1. Find user by email
    query_user = "SELECT id, username, email FROM users WHERE email = %s"
    user_row = await db.execute(query_user, (payload.email,))
    user = user_row[0] if user_row else None
    if not user:
        # To avoid leaking info, you can always return 200 even if user doesn't exist
        return {"message": "If that email exists, a reset link was sent."}

    user_id = user["id"]

    # 2. Generate a random token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)

    # 3. Store token in DB (pseudo-code)
    query_store = """
        INSERT INTO password_resets (user_id, token, expires_at)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE token=%s, expires_at=%s
    """
    await db.execute(query_store, (user_id, token, expires_at, token, expires_at))

    # 4. Construct password-reset link
    reset_link = f"https://{settings.SERVER_DOMAIN}/reset-password?token={token}"

    # 5. Send the email (simple example)
    try:
        # Build message
        msg_body = f"Hello,\n\nUse the link below to reset your password:\n{reset_link}\n\nThis link expires in {RESET_TOKEN_EXPIRE_MINUTES} minutes."
        msg = MIMEText(msg_body)
        msg["Subject"] = "Password Reset"
        msg["From"] = "no-reply@yourdomain.com"
        msg["To"] = user["email"]

        # Connect to SMTP (adjust host, port, login, etc.)
        with smtplib.SMTP("smtp.yourdomain.com", 587) as server:
            server.starttls()
            server.login("smtp_user", "smtp_password")
            server.send_message(msg)
    except Exception as e:
        # If email fails, you might still want to silently fail
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not send password reset email."
        )

    return {"message": "If that email exists, a reset link was sent."}

@router.post("/reset-password", status_code=200)
async def reset_password(payload: PasswordResetConfirm):
    """
    1) Frontend calls this with token + new password.
    2) We verify token, update user password, remove token.
    """
    # 1. Find reset token row
    query_find = """
        SELECT r.user_id, r.expires_at, u.email
        FROM password_resets r
        JOIN users u ON u.id = r.user_id
        WHERE r.token = %s
    """
    row = await db.execute(query_find, (payload.token,))
    reset_row = row[0] if row else None
    if not reset_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )

    user_id = reset_row["user_id"]
    expires_at = reset_row["expires_at"]
    if datetime.utcnow() > expires_at:
        # Token expired
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )

    # 2. Update user password
    hashed_pw = hash_password(payload.new_password)
    query_update = "UPDATE users SET password_hash = %s WHERE id = %s"
    await db.execute(query_update, (hashed_pw, user_id))

    # 3. Remove token from DB so it can't be reused
    query_delete = "DELETE FROM password_resets WHERE token = %s"
    await db.execute(query_delete, (payload.token,))

    return {"message": "Password updated successfully. You can now log in."}
