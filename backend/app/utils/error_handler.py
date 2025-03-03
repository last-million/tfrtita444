# backend/app/utils/error_handler.py

import logging
from typing import Dict, Optional, Type
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
import traceback
import json
from datetime import datetime
from ..database import db

logger = logging.getLogger(__name__)

class AppError(Exception):
    def __init__(
        self, 
        message: str, 
        error_code: str = None,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Dict = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details
        super().__init__(self.message)

class ServiceError(AppError):
    """Service-specific errors (Twilio, Ultravox, etc.)"""
    pass

class DatabaseError(AppError):
    """Database-related errors"""
    pass

class AuthenticationError(AppError):
    """Authentication-related errors"""
    def __init__(self, message: str, details: Dict = None):
        super().__init__(
            message=message,
            error_code='AUTH_ERROR',
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details
        )

class ErrorHandler:
    def __init__(self):
        self.error_mapping = {
            AuthenticationError: self._handle_auth_error,
            ServiceError: self._handle_service_error,
            DatabaseError: self._handle_database_error,
            HTTPException: self._handle_http_error,
            Exception: self._handle_generic_error
        }

    async def handle_error(
        self, 
        request: Request, 
        exc: Exception
    ) -> JSONResponse:
        """Main error handling method"""
        error_handler = self._get_error_handler(exc)
        return await error_handler(request, exc)

    def _get_error_handler(self, exc: Exception):
        """Get appropriate error handler for exception type"""
        for error_type, handler in self.error_mapping.items():
            if isinstance(exc, error_type):
                return handler
        return self._handle_generic_error

    async def _handle_auth_error(
        self, 
        request: Request, 
        exc: AuthenticationError
    ) -> JSONResponse:
        await self._log_error(request, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "Authentication Error",
                "message": str(exc),
                "code": exc.error_code,
                "details": exc.details
            }
        )

    async def _handle_service_error(
        self, 
        request: Request, 
        exc: ServiceError
    ) -> JSONResponse:
        await self._log_error(request, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "Service Error",
                "message": str(exc),
                "code": exc.error_code,
                "details": exc.details
            }
        )

    async def _handle_database_error(
        self, 
        request: Request, 
        exc: DatabaseError
    ) -> JSONResponse:
        await self._log_error(request, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "Database Error",
                "message": "A database error occurred",
                "code": exc.error_code
            }
        )

    async def _handle_http_error(
        self, 
        request: Request, 
        exc: HTTPException
    ) -> JSONResponse:
        await self._log_error(request, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "HTTP Error",
                "message": str(exc.detail)
            }
        )

    async def _handle_generic_error(
        self, 
        request: Request, 
        exc: Exception
    ) -> JSONResponse:
        await self._log_error(request, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Internal Server Error",
                "message": "An unexpected error occurred"
            }
        )

    async def _log_error(self, request: Request, exc: Exception):
        """Log error details to database and logger"""
        error_data = {
            "timestamp": datetime.utcnow(),
            "path": str(request.url),
            "method": request.method,
            "error_type": exc.__class__.__name__,
            "error_message": str(exc),
            "traceback": traceback.format_exc(),
            "headers": dict(request.headers),
            "client_ip": request.client.host
        }

        # Log to database
        try:
            query = """
                INSERT INTO error_logs (
                    timestamp, path, method, error_type,
                    error_message, traceback, headers, client_ip
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            values = (
                error_data["timestamp"],
                error_data["path"],
                error_data["method"],
                error_data["error_type"],
                error_data["error_message"],
                error_data["traceback"],
                json.dumps(error_data["headers"]),
                error_data["client_ip"]
            )
            await db.execute(query, values)
        except Exception as e:
            logger.error(f"Failed to log error to database: {str(e)}")

        # Log to logger
        logger.error(
            f"Error occurred: {error_data['error_type']} - {error_data['error_message']}",
            extra=error_data
        )

error_handler = ErrorHandler()
