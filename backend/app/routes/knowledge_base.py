from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from typing import List
import os
import logging
from ..services.google_drive_service import GoogleDriveService
from ..services.supabase_service import SupabaseService
from ..services.vectorization_service import VectorizationService

router = APIRouter()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@router.get("/drive/status")
async def get_drive_status(
    drive_service: GoogleDriveService = Depends(GoogleDriveService)
):
    try:
        return {"connected": drive_service.is_connected()}
    except Exception as e:
        logger.error(f"Drive status check failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to check drive status")

@router.get("/drive/connect")
async def connect_to_drive(
    drive_service: GoogleDriveService = Depends(GoogleDriveService)
):
    try:
        auth_url = drive_service.get_authorization_url()
        return {"authUrl": auth_url}
    except Exception as e:
        logger.error(f"Drive connection failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate authorization URL")

@router.get("/drive/callback")
async def drive_callback(
    code: str, 
    drive_service: GoogleDriveService = Depends(GoogleDriveService)
):
    try:
        drive_service.exchange_code(code)
        return {"message": "Successfully connected to Google Drive"}
    except Exception as e:
        logger.error(f"Drive callback failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to complete OAuth flow")

@router.get("/drive/files")
async def list_drive_files(
    drive_service: GoogleDriveService = Depends(GoogleDriveService)
):
    try:
        if not drive_service.is_connected():
            raise HTTPException(status_code=401, detail="Not connected to Google Drive")
        
        files = drive_service.list_files()
        return {"files": files}
    except Exception as e:
        logger.error(f"Failed to list drive files: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve drive files")

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    vectorization_service: VectorizationService = Depends(VectorizationService)
):
    try:
        # Create uploads directory if it doesn't exist
        os.makedirs("/tmp/uploads", exist_ok=True)
        
        # Generate unique filename
        file_location = f"/tmp/uploads/{file.filename}"
        
        # Save file
        with open(file_location, "wb+") as file_object:
            file_object.write(await file.read())
        
        # Optional: Validate file type
        file_type = vectorization_service.detect_file_type(file_location)
        
        return {
            "filename": file.filename, 
            "path": file_location,
            "type": file_type
        }
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")

@router.get("/supabase/tables")
async def list_supabase_tables(
    supabase_service: SupabaseService = Depends(SupabaseService)
):
    try:
        tables = supabase_service.list_tables()
        return {"tables": tables}
    except Exception as e:
        logger.error(f"Failed to list Supabase tables: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve Supabase tables")

@router.post("/vectorize")
async def vectorize_documents(
    files: List[str], 
    supabase_table: str,
    vectorization_service: VectorizationService = Depends(VectorizationService),
    supabase_service: SupabaseService = Depends(SupabaseService)
):
    try:
        vectorization_results = []
        
        for file_path in files:
            # Detect file type and extract content
            content = vectorization_service.extract_content(file_path)
            
            # Generate vector
            vector = vectorization_service.vectorize(content)
            
            # Store in Supabase
            result = supabase_service.store_vector(
                supabase_table, 
                file_path, 
                vector
            )
            
            vectorization_results.append({
                "file": file_path,
                "vector_length": len(vector),
                "stored": True
            })
        
        return {
            "message": "Vectorization complete",
            "results": vectorization_results
        }
    except Exception as e:
        logger.error(f"Vectorization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Vectorization failed: {str(e)}")
