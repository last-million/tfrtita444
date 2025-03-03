from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import os
import tempfile
from ..database import db
from ..middleware.auth import verify_token
from ..services.vectorization_service import VectorizationService
from ..services.google_drive_service import GoogleDriveService
from ..services.supabase_service import SupabaseService

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize services
vectorization_service = VectorizationService()
google_drive_service = GoogleDriveService()
supabase_service = SupabaseService()

class DocumentMetadata(BaseModel):
    document_id: str
    title: str
    source: str  # e.g., 'google_drive'
    mime_type: str
    size: int
    last_modified: str

class VectorizationRequest(BaseModel):
    document_id: str
    supabase_table: str
    embedding_model: Optional[str] = "default"
    chunk_size: Optional[int] = 1000
    chunk_overlap: Optional[int] = 200

class FileVectorizationRequest(BaseModel):
    supabase_table: str
    embedding_model: Optional[str] = "default"
    chunk_size: Optional[int] = 1000
    chunk_overlap: Optional[int] = 200

class VectorSearchRequest(BaseModel):
    query: str
    top_k: int = 5
    supabase_table: str
    similarity_threshold: Optional[float] = 0.7

@router.get("/documents")
async def list_drive_documents(user=Depends(verify_token)):
    """
    List documents from connected Google Drive
    """
    try:
        # Get user's credentials for Google Drive
        credentials_query = """
            SELECT credentials 
            FROM service_credentials 
            WHERE service = 'Google Drive' AND user_id = %s AND is_connected = TRUE
        """
        credentials_result = await db.execute(credentials_query, (user.get('id'),))
        
        if not credentials_result:
            raise HTTPException(status_code=400, detail="Google Drive not connected for this user")
        
        credentials = credentials_result[0].get('credentials')
        if not credentials:
            raise HTTPException(status_code=400, detail="Invalid Google Drive credentials")
        
        # List documents using the Google Drive service
        documents = await google_drive_service.list_documents(credentials)
        return {"documents": documents}
        
    except Exception as e:
        logger.error(f"Error listing Google Drive documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file_for_vectorization(
    file: UploadFile = File(...),
    supabase_table: str = None,
    user=Depends(verify_token)
):
    """
    Upload a file and vectorize it
    """
    if not supabase_table:
        raise HTTPException(status_code=400, detail="supabase_table is required")
        
    try:
        # Create a temporary file to store the uploaded content
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            # Write the uploaded file content to the temporary file
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Extract text from the file
        try:
            text_content = vectorization_service.extract_content(temp_path)
        finally:
            # Clean up the temporary file
            os.unlink(temp_path)
            
        if not text_content:
            raise HTTPException(status_code=400, detail="Failed to extract text from file")
            
        # Get chunks of text
        chunks = await split_text_into_chunks(text_content, 1000, 200)
        
        # Get embeddings for each chunk
        embeddings = [vectorization_service.vectorize(chunk) for chunk in chunks]
        
        # Store in Supabase
        # Get user's Supabase credentials
        supabase_query = """
            SELECT credentials 
            FROM service_credentials 
            WHERE service = 'Supabase' AND user_id = %s AND is_connected = TRUE
        """
        supabase_result = await db.execute(supabase_query, (user.get('id'),))
        
        if not supabase_result:
            raise HTTPException(status_code=400, detail="Supabase not connected for this user")
            
        supabase_credentials = supabase_result[0].get('credentials')
        
        # Store vectors in Supabase
        result = await supabase_service.store_embeddings(
            supabase_credentials,
            supabase_table,
            chunks,
            embeddings,
            {"filename": file.filename, "size": len(content)}
        )
        
        # Log the vectorization in the database
        log_query = """
            INSERT INTO knowledge_base_documents 
            (filename, source, user_id, supabase_table, size, chunk_count) 
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        await db.execute(
            log_query, 
            (file.filename, "upload", user.get('id'), supabase_table, len(content), len(chunks))
        )
        
        return {
            "status": "vectorization_complete",
            "filename": file.filename,
            "vector_count": len(chunks),
            "supabase_table": supabase_table
        }
        
    except Exception as e:
        logger.error(f"Error vectorizing uploaded file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vectorize")
async def vectorize_document(request: VectorizationRequest, user=Depends(verify_token)):
    """
    Vectorize a document and store in Supabase
    """
    try:
        # Get user's credentials for Google Drive
        google_drive_query = """
            SELECT credentials 
            FROM service_credentials 
            WHERE service = 'Google Drive' AND user_id = %s AND is_connected = TRUE
        """
        google_drive_result = await db.execute(google_drive_query, (user.get('id'),))
        
        if not google_drive_result:
            raise HTTPException(status_code=400, detail="Google Drive not connected for this user")
            
        google_drive_credentials = google_drive_result[0].get('credentials')
        
        # Get user's Supabase credentials
        supabase_query = """
            SELECT credentials 
            FROM service_credentials 
            WHERE service = 'Supabase' AND user_id = %s AND is_connected = TRUE
        """
        supabase_result = await db.execute(supabase_query, (user.get('id'),))
        
        if not supabase_result:
            raise HTTPException(status_code=400, detail="Supabase not connected for this user")
            
        supabase_credentials = supabase_result[0].get('credentials')
        
        # Download the document from Google Drive
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            document_metadata = await google_drive_service.download_document(
                google_drive_credentials, 
                request.document_id,
                temp_file.name
            )
            temp_path = temp_file.name
        
        try:
            # Extract text from document
            text_content = vectorization_service.extract_content(temp_path)
            
            if not text_content:
                raise HTTPException(status_code=400, detail="Failed to extract text from document")
                
            # Split text into chunks
            chunks = await split_text_into_chunks(
                text_content, 
                request.chunk_size, 
                request.chunk_overlap
            )
            
            # Get embeddings for each chunk
            embeddings = [vectorization_service.vectorize(chunk) for chunk in chunks]
            
            # Store in Supabase
            result = await supabase_service.store_embeddings(
                supabase_credentials,
                request.supabase_table,
                chunks,
                embeddings,
                {"document_id": request.document_id, "title": document_metadata.get("title")}
            )
            
            # Log the vectorization in the database
            log_query = """
                INSERT INTO knowledge_base_documents 
                (document_id, filename, source, user_id, supabase_table, size, chunk_count) 
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            await db.execute(
                log_query, 
                (
                    request.document_id, 
                    document_metadata.get("title"), 
                    "google_drive", 
                    user.get('id'), 
                    request.supabase_table, 
                    document_metadata.get("size"), 
                    len(chunks)
                )
            )
            
            return {
                "status": "vectorization_complete",
                "document_id": request.document_id,
                "title": document_metadata.get("title"),
                "vector_count": len(chunks),
                "supabase_table": request.supabase_table
            }
            
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        logger.error(f"Error vectorizing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search")
async def search_knowledge_base(request: VectorSearchRequest, user=Depends(verify_token)):
    """
    Perform vector similarity search in knowledge base
    """
    try:
        # Get user's Supabase credentials
        supabase_query = """
            SELECT credentials 
            FROM service_credentials 
            WHERE service = 'Supabase' AND user_id = %s AND is_connected = TRUE
        """
        supabase_result = await db.execute(supabase_query, (user.get('id'),))
        
        if not supabase_result:
            raise HTTPException(status_code=400, detail="Supabase not connected for this user")
            
        supabase_credentials = supabase_result[0].get('credentials')
        
        # Generate embedding for the query
        query_embedding = vectorization_service.vectorize(request.query)
        
        # Search in Supabase
        search_results = await supabase_service.search_embeddings(
            supabase_credentials,
            request.supabase_table,
            query_embedding,
            request.top_k,
            request.similarity_threshold
        )
        
        return {
            "query": request.query,
            "results": search_results
        }
        
    except Exception as e:
        logger.error(f"Error searching knowledge base: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def split_text_into_chunks(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """
    Split text into overlapping chunks for better embedding
    """
    if not text:
        return []
        
    chunks = []
    start = 0
    text_length = len(text)
    
    while start < text_length:
        end = min(start + chunk_size, text_length)
        
        # If we're not at the beginning, adjust the start to create overlap
        if start > 0:
            start = start - chunk_overlap
            
        # Extract the chunk and add to our list
        chunk = text[start:end]
        
        # Don't add empty chunks
        if chunk.strip():
            chunks.append(chunk)
            
        # Move to the next chunk
        start = end
        
    return chunks
