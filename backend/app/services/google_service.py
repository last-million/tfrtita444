# backend/app/services/google_service.py

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from email.mime.text import MIMEText
import base64
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from ..config import settings
from ..database import db

logger = logging.getLogger(__name__)

class GoogleService:
    def __init__(self):
        self.client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [f"https://{settings.SERVER_DOMAIN}/api/auth/google/callback"]
            }
        }
        self.scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/drive.readonly'
        ]

    async def get_credentials(self, user_id: int) -> Optional[Credentials]:
        """Get stored credentials for user"""
        try:
            query = "SELECT credentials FROM service_credentials WHERE user_id = %s AND service_name = 'google'"
            result = await db.fetchone(query, (user_id,))
            
            if result and result['credentials']:
                creds_data = json.loads(result['credentials'])
                return Credentials.from_authorized_user_info(creds_data, self.scopes)
            return None
        except Exception as e:
            logger.error(f"Error getting credentials: {str(e)}")
            return None

    async def store_credentials(self, user_id: int, credentials: Dict):
        """Store Google credentials"""
        try:
            query = """
                INSERT INTO service_credentials (user_id, service_name, credentials)
                VALUES (%s, 'google', %s)
                ON DUPLICATE KEY UPDATE credentials = %s
            """
            creds_json = json.dumps(credentials)
            await db.execute(query, (user_id, creds_json, creds_json))
        except Exception as e:
            logger.error(f"Error storing credentials: {str(e)}")
            raise

    # Calendar Methods
    async def create_meeting(
        self,
        user_id: int,
        title: str,
        start_time: datetime,
        end_time: datetime,
        attendees: List[str],
        description: str = "",
        location: str = ""
    ) -> Dict:
        """Create a Google Calendar event"""
        try:
            credentials = await self.get_credentials(user_id)
            if not credentials:
                raise Exception("No valid credentials found")

            service = build('calendar', 'v3', credentials=credentials)
            
            event = {
                'summary': title,
                'location': location,
                'description': description,
                'start': {
                    'dateTime': start_time.isoformat(),
                    'timeZone': 'UTC',
                },
                'end': {
                    'dateTime': end_time.isoformat(),
                    'timeZone': 'UTC',
                },
                'attendees': [{'email': email} for email in attendees],
                'reminders': {
                    'useDefault': True
                },
                'conferenceData': {
                    'createRequest': {
                        'requestId': f"meeting_{datetime.now().timestamp()}",
                        'conferenceSolutionKey': {'type': 'hangoutsMeet'}
                    }
                }
            }

            event = service.events().insert(
                calendarId='primary',
                body=event,
                conferenceDataVersion=1
            ).execute()

            # Store meeting details in database
            await self._store_meeting(user_id, event)

            return {
                'event_id': event['id'],
                'meet_link': event.get('hangoutLink'),
                'status': event['status']
            }

        except Exception as e:
            logger.error(f"Error creating meeting: {str(e)}")
            raise

    async def send_email(
        self,
        user_id: int,
        to: str,
        subject: str,
        body: str,
        html: bool = False
    ) -> Dict:
        """Send email using Gmail API"""
        try:
            credentials = await self.get_credentials(user_id)
            if not credentials:
                raise Exception("No valid credentials found")

            service = build('gmail', 'v1', credentials=credentials)
            
            message = MIMEText(body, 'html' if html else 'plain')
            message['to'] = to
            message['subject'] = subject

            raw = base64.urlsafe_b64encode(message.as_bytes())
            raw = raw.decode()
            
            message = service.users().messages().send(
                userId='me',
                body={'raw': raw}
            ).execute()

            # Store email details in database
            await self._store_email(user_id, message, to, subject)

            return {
                'message_id': message['id'],
                'thread_id': message['threadId']
            }

        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            raise

    async def list_drive_files(
        self,
        user_id: int,
        folder_id: Optional[str] = None,
        file_types: Optional[List[str]] = None
    ) -> List[Dict]:
        """List files from Google Drive"""
        try:
            credentials = await self.get_credentials(user_id)
            if not credentials:
                raise Exception("No valid credentials found")

            service = build('drive', 'v3', credentials=credentials)
            
            query = []
            if folder_id:
                query.append(f"'{folder_id}' in parents")
            if file_types:
                mime_types = [f"mimeType='{mime}'" for mime in file_types]
                query.append(f"({' or '.join(mime_types)})")

            query_string = ' and '.join(query) if query else None

            results = []
            page_token = None
            while True:
                response = service.files().list(
                    q=query_string,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, mimeType, size, modifiedTime)',
                    pageToken=page_token
                ).execute()

                results.extend(response.get('files', []))
                page_token = response.get('nextPageToken')
                if not page_token:
                    break

            return results

        except Exception as e:
            logger.error(f"Error listing drive files: {str(e)}")
            raise

    async def get_file_content(self, user_id: int, file_id: str) -> str:
        """Get content of a Google Drive file"""
        try:
            credentials = await self.get_credentials(user_id)
            if not credentials:
                raise Exception("No valid credentials found")

            service = build('drive', 'v3', credentials=credentials)
            
            file = service.files().get(fileId=file_id).execute()
            content = service.files().get_media(fileId=file_id).execute()
            
            return content.decode('utf-8')

        except Exception as e:
            logger.error(f"Error getting file content: {str(e)}")
            raise

    async def _store_meeting(self, user_id: int, event: Dict):
        """Store meeting details in database"""
        try:
            query = """
                INSERT INTO calendar_events (
                    user_id, event_id, title, start_time, 
                    end_time, meet_link, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            values = (
                user_id,
                event['id'],
                event['summary'],
                event['start']['dateTime'],
                event['end']['dateTime'],
                event.get('hangoutLink'),
                event['status']
            )
            await db.execute(query, values)
        except Exception as e:
            logger.error(f"Error storing meeting: {str(e)}")

    async def _store_email(
        self,
        user_id: int,
        message: Dict,
        recipient: str,
        subject: str
    ):
        """Store email details in database"""
        try:
            query = """
                INSERT INTO sent_emails (
                    user_id, message_id, thread_id, 
                    recipient, subject, sent_at
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """
            values = (
                user_id,
                message['id'],
                message['threadId'],
                recipient,
                subject,
                datetime.now()
            )
            await db.execute(query, values)
        except Exception as e:
            logger.error(f"Error storing email: {str(e)}")

    async def revoke_credentials(self, user_id: int):
        """Revoke Google credentials"""
        try:
            query = "DELETE FROM service_credentials WHERE user_id = %s AND service_name = 'google'"
            await db.execute(query, (user_id,))
        except Exception as e:
            logger.error(f"Error revoking credentials: {str(e)}")
            raise

google_service = GoogleService()
