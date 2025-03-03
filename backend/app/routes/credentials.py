from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from ..services.credential_validator import credential_validator

router = APIRouter()

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
