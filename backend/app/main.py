import os
import logging
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes import auth, health, calls, credentials, dashboard, knowledge_base
from .websockets import media_stream, handler
from .database import db, create_tables

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Voice Call AI API",
    description="API for Voice Call AI application",
    version="1.0.0"
)

# Parse CORS origins from settings
cors_origins = settings.cors_origins.split(",") if settings.cors_origins else ["*"]

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        # Connect to the database
        logger.info("Connecting to database...")
        await db.connect()
        
        # Create necessary tables
        logger.info("Creating database tables if they don't exist...")
        await create_tables()
        
        logger.info("Application started successfully with database connection")
    except Exception as e:
        logger.error(f"Startup error: {e}")
        # Don't raise the exception here to allow the app to start even with DB issues
        # This will let the health endpoint report the actual status

@app.on_event("shutdown")
async def shutdown_event():
    try:
        await db.close()
        logger.info("Database connection closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(calls.router, prefix="/api/calls", tags=["Calls"])
app.include_router(credentials.router, prefix="/api/credentials", tags=["Credentials"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(knowledge_base.router, prefix="/api/knowledge", tags=["Knowledge Base"])

# Include WebSocket routers
app.include_router(media_stream.router, tags=["WebSocket"])
app.include_router(handler.router, tags=["WebSocket"])

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Voice Call AI API is running",
        "version": "1.0.0",
        "environment": os.getenv("ENV", "production"),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api")
async def api_root():
    return {
        "status": "ok",
        "message": "Voice Call AI API is running",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
