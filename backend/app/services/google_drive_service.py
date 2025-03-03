import logging
import os
import json
from typing import Dict, List, Any, Optional
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from datetime import datetime
import io

logger = logging.getLogger(__name__)

class GoogleDriveService:
    def __init__(self):
        self.scopes = [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]
        
    async def list_documents(self, credentials_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        List documents from Google Drive
        """
        try:
            # Create credentials from dictionary
            credentials = self._create_credentials(credentials_dict)
            
            # Build the Drive API client
            service = build('drive', 'v3', credentials=credentials)
            
            # Call the Drive v3 API to list files
            results = service.files().list(
                q="mimeType='application/pdf' or mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
                pageSize=100,
                fields="nextPageToken, files(id, name, mimeType, size, modifiedTime)"
            ).execute()
            
            documents = []
            for file in results.get('files', []):
                doc_metadata = {
                    'document_id': file.get('id'),
                    'title': file.get('name'),
                    'source': 'google_drive',
                    'mime_type': file.get('mimeType'),
                    'size': file.get('size', 0),
                    'last_modified': file.get('modifiedTime')
                }
                documents.append(doc_metadata)
                
            return documents
            
        except Exception as e:
            logger.error(f"Error listing documents from Google Drive: {str(e)}")
            raise Exception(f"Google Drive API error: {str(e)}")
    
    async def download_document(self, credentials_dict: Dict[str, Any], document_id: str, local_path: str) -> Dict[str, Any]:
        """
        Download a document from Google Drive to a local path
        """
        try:
            # Create credentials from dictionary
            credentials = self._create_credentials(credentials_dict)
            
            # Build the Drive API client
            service = build('drive', 'v3', credentials=credentials)
            
            # Get file metadata
            file_metadata = service.files().get(fileId=document_id, fields="id, name, mimeType, size, modifiedTime").execute()
            
            # Download the file content
            request = service.files().get_media(fileId=document_id)
            
            with open(local_path, 'wb') as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                
            return {
                'document_id': file_metadata.get('id'),
                'title': file_metadata.get('name'),
                'mime_type': file_metadata.get('mimeType'),
                'size': file_metadata.get('size', 0),
                'last_modified': file_metadata.get('modifiedTime')
            }
            
        except Exception as e:
            logger.error(f"Error downloading document from Google Drive: {str(e)}")
            raise Exception(f"Google Drive API error: {str(e)}")
    
    def _create_credentials(self, credentials_dict: Dict[str, Any]) -> Credentials:
        """
        Create Google OAuth2 credentials from a dictionary
        """
        # Convert the credentials dictionary back to a Google OAuth2 credentials object
        return Credentials(
            token=credentials_dict.get('token'),
            refresh_token=credentials_dict.get('refresh_token'),
            token_uri=credentials_dict.get('token_uri', 'https://oauth2.googleapis.com/token'),
            client_id=credentials_dict.get('client_id'),
            client_secret=credentials_dict.get('client_secret'),
            scopes=self.scopes
        )
