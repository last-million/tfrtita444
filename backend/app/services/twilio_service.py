# backend/app/services/twilio_service.py

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from typing import Optional, Dict, List
import logging
from datetime import datetime
from ..config import settings
from ..database import db

logger = logging.getLogger(__name__)

class TwilioService:
    def __init__(self):
        self.account_sid = settings.twilio_account_sid  # or settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.twilio_auth_token    # or settings.TWILIO_AUTH_TOKEN
        
        # Validate Twilio credentials
        if not self.account_sid or not self.auth_token or \
           self.account_sid == "placeholder-value" or self.auth_token == "placeholder-value":
            logger.warning("Twilio credentials are missing or using placeholder values. Calls will not work.")
            self.credentials_valid = False
        else:
            self.credentials_valid = True
            self.client = Client(self.account_sid, self.auth_token)

        # Build callback URLs
        self.webhook_url = f"https://{settings.server_domain}/api/calls/incoming-call"
        self.status_callback = f"https://{settings.server_domain}/api/calls/status"

    async def make_call(self, to_number: str, from_number: str, ultravox_url: str = None) -> Dict:
        """
        Initiate a call using Twilio with optional Ultravox integration.
        """
        # Check if credentials are valid before attempting to make a call
        if not self.credentials_valid:
            error_msg = "Cannot make calls: Twilio credentials are missing or invalid"
            logger.error(error_msg)
            raise Exception(error_msg)
            
        # Validate phone numbers
        if not to_number or not from_number:
            error_msg = "Both 'to' and 'from' phone numbers are required"
            logger.error(error_msg)
            raise Exception(error_msg)
            
        try:
            if ultravox_url:
                # Log the Ultravox URL we're using
                logger.info(f"Making call with Ultravox integration. URL: {ultravox_url}")
                
                # Create TwiML with <Connect><Stream> for Ultravox
                twiml = VoiceResponse()
                connect = Connect()
                
                # Format URL if needed
                if ultravox_url.startswith('http'):
                    # Convert to WebSocket if it's an HTTP URL
                    ultravox_url = ultravox_url.replace('https://', 'wss://')
                
                stream = Stream(url=ultravox_url)
                # Add parameters for better media streaming
                stream.parameter(name="format", value="audio/x-raw")
                stream.parameter(name="sampleRate", value="16000")
                
                connect.append(stream)
                twiml.append(connect)
                
                # Log the TwiML we're sending
                twiml_str = str(twiml)
                logger.debug(f"Using TwiML: {twiml_str}")
                
                # Make the call with explicit content-type headers
                extra_params = {
                    'twiml': twiml_str,
                    'status_callback': self.status_callback,
                    'status_callback_event': ['initiated', 'ringing', 'answered', 'completed'],
                    'status_callback_method': 'POST',
                    'record': True
                }
                
                # Create the call with proper headers
                call = self.client.calls.create(
                    to=to_number,
                    from_=from_number,
                    **extra_params
                )
                logger.info(f"Twilio call with Ultravox created. SID: {call.sid}")

            else:
                # Standard Twilio call (hits your incoming-call endpoint)
                logger.info(f"Making standard Twilio call to webhook: {self.webhook_url}")
                call = self.client.calls.create(
                    to=to_number,
                    from_=from_number,
                    url=self.webhook_url,
                    status_callback=self.status_callback,
                    status_callback_event=['initiated', 'ringing', 'answered', 'completed'],
                    status_callback_method='POST',
                    record=True
                )
                logger.info(f"Standard Twilio call created. SID: {call.sid}")

            # Note: Call record will be inserted by the route handler instead of here
            # to avoid duplicate entries and ensure consistency

            return {
                "status": "success",
                "call_sid": call.sid,
                "call_status": call.status,
                "message": "Call initiated successfully"
            }

        except TwilioRestException as e:
            # Handle Twilio-specific exceptions with detailed error info
            error_code = getattr(e, 'code', 0)
            status_code = getattr(e, 'status', 0)
            
            logger.error(f"Twilio error: {str(e)}")
            logger.error(f"Twilio error details - Code: {error_code}, Status: {status_code}")
            
            # Provide more specific error messages based on common Twilio errors
            if error_code == 21211:
                raise Exception(f"Invalid 'to' phone number format: {to_number}")
            elif error_code == 21214:
                raise Exception(f"'To' phone number cannot be reached: {to_number}")
            elif error_code == 21606:
                raise Exception("The 'from' number is not a valid, purchased Twilio number")
            elif error_code == 20003:
                raise Exception("Authentication error: Please check your Twilio credentials")
            else:
                raise Exception(f"Failed to initiate call: {str(e)}")
                
        except Exception as e:
            # Handle other exceptions
            logger.error(f"Unexpected error making call: {str(e)}", exc_info=True)
            raise Exception(f"Failed to initiate call: {str(e)}")

    async def bulk_calls(self, numbers: List[str], from_number: str) -> List[Dict]:
        """
        Initiate multiple calls in bulk.
        """
        # Check if credentials are valid before attempting to make calls
        if not self.credentials_valid:
            error_msg = "Cannot make bulk calls: Twilio credentials are missing or invalid"
            logger.error(error_msg)
            return [{
                "number": number,
                "status": "failed",
                "error": error_msg
            } for number in numbers]
            
        results = []
        for number in numbers:
            try:
                result = await self.make_call(number, from_number)
                results.append({
                    "number": number,
                    "status": "success",
                    "call_sid": result["call_sid"]
                })
            except Exception as e:
                results.append({
                    "number": number,
                    "status": "failed",
                    "error": str(e)
                })
        return results

    async def get_call_details(self, call_sid: str) -> Dict:
        """
        Get detailed information about a specific call from Twilio.
        """
        # Check if credentials are valid before attempting to fetch call details
        if not self.credentials_valid:
            error_msg = "Cannot get call details: Twilio credentials are missing or invalid"
            logger.error(error_msg)
            raise Exception(error_msg)
            
        if not call_sid:
            error_msg = "Call SID is required to fetch call details"
            logger.error(error_msg)
            raise Exception(error_msg)
            
        try:
            call = self.client.calls(call_sid).fetch()
            recordings = self.client.recordings.list(call_sid=call_sid)

            cost = 0.0
            if call.price:
                cost = float(call.price)

            details = {
                "call_sid": call.sid,
                "from_number": call.from_,
                "to_number": call.to,
                "status": call.status,
                "duration": call.duration,
                "direction": call.direction,
                "start_time": call.start_time,
                "end_time": call.end_time,
                "cost": cost,
                "recordings": [
                    {
                        "recording_sid": rec.sid,
                        "duration": rec.duration,
                        "url": rec.url
                    }
                    for rec in recordings
                ]
            }
            return details

        except TwilioRestException as e:
            logger.error(f"Error fetching call details: {str(e)}")
            raise Exception(f"Failed to fetch call details: {str(e)}")

    async def generate_call_twiml(self, ultravox_ws_url: str) -> str:
        """
        Generate TwiML for call handling with Ultravox integration.
        """
        response = VoiceResponse()
        connect = Connect()
        stream = Stream(url=ultravox_ws_url)
        
        # Add important parameters for Ultravox media streaming
        stream.parameter(name="format", value="audio/x-raw")
        stream.parameter(name="sampleRate", value="16000")
        
        connect.append(stream)
        response.append(connect)
        
        # Log the generated TwiML for debugging
        twiml_str = str(response)
        logger.debug(f"Generated TwiML: {twiml_str}")
        
        return twiml_str

    async def handle_status_callback(self, data: Dict) -> None:
        """
        Handle Twilio status callback events (e.g. initiated, ringing, answered, completed).
        """
        try:
            call_sid = data.get('CallSid')
            status = data.get('CallStatus')
            duration = data.get('CallDuration')

            query = """
                UPDATE calls
                SET status = %s,
                    duration = %s,
                    end_time = %s
                WHERE call_sid = %s
            """
            # If status is 'completed', set end_time to now
            end_time = datetime.utcnow() if status == 'completed' else None

            values = (status, duration, end_time, call_sid)
            await db.execute(query, values)

            logger.info(f"Updated call status for {call_sid} => {status}")

        except Exception as e:
            logger.error(f"Error handling status callback: {str(e)}")
            raise Exception(f"Failed to handle status callback: {str(e)}")

    async def get_call_recording(self, call_sid: str) -> Optional[str]:
        """
        Return the first recording URL for a call, if any.
        """
        try:
            recordings = self.client.recordings.list(call_sid=call_sid)
            if recordings:
                return recordings[0].url
            return None
        except TwilioRestException as e:
            logger.error(f"Error fetching recording: {str(e)}")
            return None

    async def get_call_metrics(self, start_date: datetime, end_date: datetime) -> Dict:
        """
        Return aggregated call metrics (count, duration, cost, etc.) over a date range.
        """
        try:
            calls = self.client.calls.list(
                start_time_after=start_date,
                start_time_before=end_date
            )
            total_calls = len(calls)
            total_duration = sum(int(call.duration or 0) for call in calls)
            total_cost = sum(float(call.price or 0) for call in calls)

            return {
                "total_calls": total_calls,
                "total_duration": total_duration,
                "total_cost": total_cost,
                "average_duration": (total_duration / total_calls) if total_calls > 0 else 0.0,
                "average_cost": (total_cost / total_calls) if total_calls > 0 else 0.0
            }

        except TwilioRestException as e:
            logger.error(f"Error fetching call metrics: {str(e)}")
            raise Exception(f"Failed to fetch call metrics: {str(e)}")


# Singleton instance
twilio_service = TwilioService()
