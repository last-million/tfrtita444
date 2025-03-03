# backend/app/routes/health.py

from fastapi import APIRouter, HTTPException
from ..database import db
from typing import Dict
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/health")
async def health_check() -> Dict:
    """
    Comprehensive health check endpoint
    """
    health_status = {
        "status": "healthy",
        "services": {
            "database": False,
            "twilio": False,
            "ultravox": False,
            "google": False
        }
    }

    try:
        # Check database
        await db.execute("SELECT 1")
        health_status["services"]["database"] = True
    except Exception as e:
        health_status["status"] = "unhealthy"
        logger.error(f"Database health check failed: {str(e)}")

    # Add more service checks as needed

    if health_status["status"] != "healthy":
        raise HTTPException(status_code=503, detail=health_status)

    return health_status
