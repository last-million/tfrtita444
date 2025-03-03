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
                # TwiML with <Connect><Stream> for Ultravox
                twiml = VoiceResponse()
                connect = Connect()
                stream = Stream(url=ultravox_url)
                connect.append(stream)
                twiml.append(connect)

                call = self.client.calls.create(
                    to=to_number,
                    from_=from_number,
                    twiml=str(twiml),
                    status_callback=self.status_callback,
                    status_callback_event=['initiated', 'ringing', 'answered', 'completed'],
                    record=True
                )
                logger.info(f"Twilio call with Ultravox. SID: {call.sid}")

            else:
                # Standard Twilio call (hits your incoming-call endpoint)
                call = self.client.calls.create(
                    to=to_number,
                    from_=from_number,
                    url=self.webhook_url,
                    status_callback=self.status_callback,
                    status_callback_event=['initiated', 'ringing', 'answered', 'completed'],
                    record=True
                )
                logger.info(f"Twilio call (no Ultravox). SID: {call.sid}")

            # Insert call record into DB
            query = """
                INSERT INTO calls (
                    call_sid, from_number, to_number, status,
                    start_time, direction
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            values = (
                call.sid,
                from_number,
                to_number,
                call.status,
                datetime.utcnow(),
                'outbound'
            )
            await db.execute(query, values)

            return {
                "status": "success",
                "call_sid": call.sid,
                "call_status": call.status
            }

        except TwilioRestException as e:
            logger.error(f"Twilio error: {str(e)}")
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
        connect.append(stream)
        response.append(connect)
        return str(response)

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
