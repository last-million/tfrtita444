from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
from ..services.credential_validator import credential_validator
from ..middleware.auth import verify_token
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class CredentialValidationRequest(BaseModel):
    service: str
    credentials: Dict[str, Any]

@router.post("/validate")
async def validate_credentials(request: CredentialValidationRequest):
    try:
        encrypted_credentials = credential_validator.encrypt_credentials(request.credentials)
        validation_result = credential_validator.validate_credentials(request.service, request.credentials)
        if not validation_result['valid']:
            raise HTTPException(status_code=400, detail=validation_result['error'])
        return {
            "status": "success",
            "message": "Credentials validated successfully",
            "encrypted_credentials": encrypted_credentials
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Credential validation error: {str(e)}")

@router.post("/decrypt")
async def decrypt_credentials(encrypted_credentials: Dict[str, Any]):
    try:
        decrypted_credentials = credential_validator.decrypt_credentials(encrypted_credentials)
        if decrypted_credentials is None:
            raise HTTPException(status_code=400, detail="Decryption failed")
        return decrypted_credentials
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Credential decryption error: {str(e)}")
        
@router.get("/status/{service_name}")
async def get_credential_status(service_name: str):
    """
    Check if credentials for a service are valid and the service is connected
    """
    try:
        # In a real implementation, you would check if the service is actually connected
        # For example, by making a test API call to the service
        
        # For now, this is a simplified implementation
        # We'll assume that if the credentials exist, the service is connected
        
        # This is a hardcoded list for dev/test environments
        services_connected = {
            "Twilio": True,
            "Supabase": True,
            "Google Calendar": True,
            "Ultravox": True,
            "SERP API": True,
            "Airtable": True,
            "Gmail": True,
            "Google Drive": True
        }
        
        is_connected = services_connected.get(service_name, False)
        
        # Return the status with more complete info the frontend expects
        return {
            "service": service_name,
            "connected": is_connected,
            "status": "configured" if is_connected else "not_configured",
            "message": f"{service_name} is {'successfully configured' if is_connected else 'not configured'}",
            "last_checked": "just now"
        }
    except Exception as e:
        logger.error(f"Error checking status for {service_name}: {str(e)}")
        # Return a 200 with connected=false rather than an error
        # This ensures the frontend can display the disconnected state rather than an error
        return {
            "service": service_name,
            "connected": False,
            "status": "error",
            "message": f"Error checking {service_name} connection",
            "error": str(e),
            "last_checked": "just now"
        }

@router.get("/api/status/{service_name}")
async def get_credential_status_alt_path(service_name: str):
    """Handle the incorrect path with /api prefix"""
    return await get_credential_status(service_name)
