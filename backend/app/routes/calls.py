from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from ..database import db  # Import the database connection
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from ..middleware.auth import verify_token
import logging
from ..services.twilio_service import twilio_service
from ..services.ultravox_service import ultravox_service
from ..config import settings

router = APIRouter()

# Configure logging
logger = logging.getLogger(__name__)

class CallLog(BaseModel):
    id: int
    call_sid: str
    from_number: str
    to_number: str
    direction: str = Field(..., description="inbound or outbound")
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[int] = None
    recording_url: Optional[str] = None
    transcription: Optional[str] = None
    cost: Optional[float] = None
    segments: Optional[int] = None
    ultravox_cost: Optional[float] = None
    created_at: datetime

class BulkCallRequest(BaseModel):
    phone_numbers: List[str]
    message_template: Optional[str] = None

class Client(BaseModel):
    id: Optional[int] = None
    name: str
    phone_number: str
    email: Optional[str] = None
    address: Optional[str] = None  # Add address field

@router.post("/initiate")
async def initiate_call(
    request: Request,
    to_number: Optional[str] = Query(None, title="The number to call"),
    from_number: Optional[str] = Query("+1234567890", title="Twilio From Number"),
    ultravox_url: Optional[str] = Query(None, title="Ultravox WebSocket URL"),
    user=Depends(verify_token)
):
    """
    Initiate an outbound call via Twilio, optionally connecting to Ultravox
    """
    try:
        # Check if parameters were sent as query params or in the request body
        if not to_number:
            # Try to get parameters from request body
            try:
                body = await request.json()
                to_number = body.get("to_number") or body.get("to")
                from_number = body.get("from_number") or body.get("from") or from_number
                ultravox_url = body.get("ultravox_url") or ultravox_url
            except:
                # If not JSON, try to get from form data
                try:
                    form = await request.form()
                    to_number = form.get("to_number") or form.get("to")
                    from_number = form.get("from_number") or form.get("from") or from_number
                    ultravox_url = form.get("ultravox_url") or ultravox_url
                except:
                    # If not form data, try to get from URL params
                    params = dict(request.query_params)
                    to_number = params.get("to_number") or params.get("to")
                    from_number = params.get("from_number") or params.get("from") or from_number
                    ultravox_url = params.get("ultravox_url") or ultravox_url

        # Log the request details
        logger.info(f"Call initiation request - To: {to_number}, From: {from_number}, Ultravox URL: {ultravox_url}")
        
        # Check if Twilio is configured
        if not twilio_service.credentials_valid:
            logger.error("Twilio credentials are not configured properly")
            raise HTTPException(
                status_code=503, 
                detail="Twilio service is not properly configured. Please check your Twilio credentials."
            )
        
        # Validate phone numbers
        if not to_number or not to_number.startswith('+'):
            raise HTTPException(
                status_code=400, 
                detail="The 'to_number' must be a valid phone number in E.164 format (+XXXXXXXXXXXX)"
            )
            
        # Validate and format Ultravox URL if provided
        if ultravox_url:
            logger.info(f"Using Ultravox integration with URL: {ultravox_url}")
            
            # Validate Ultravox URL format
            if not ultravox_service.is_valid_url(ultravox_url):
                logger.error(f"Invalid Ultravox URL format: {ultravox_url}")
                raise HTTPException(
                    status_code=400,
                    detail="Invalid Ultravox URL format. Please use a valid Ultravox media URL."
                )
            
            # Make sure the URL is properly formatted according to Ultravox documentation
            if not ultravox_url.startswith(('https://', 'wss://')):
                ultravox_url = f"wss://{ultravox_url.lstrip('/')}"
                
        # Try to initiate the call with error handling for Ultravox-specific issues
        try:
            call_details = await twilio_service.make_call(to_number, from_number, ultravox_url)
            logger.info(f"Call initiated successfully: {call_details}")
            return call_details
        except Exception as e:
            # Check if this is an Ultravox-specific error (e.g., connection issues)
            error_msg = str(e).lower()
            if ultravox_url and ("ultravox" in error_msg or 
                                 "connection" in error_msg or 
                                 "timeout" in error_msg or
                                 "websocket" in error_msg):
                logger.warning(f"Ultravox connection issue, attempting call without Ultravox: {str(e)}")
                
                # Try again without Ultravox
                call_details = await twilio_service.make_call(to_number, from_number, None)
                logger.info(f"Call initiated successfully without Ultravox: {call_details}")
                
                # Add a note about using fallback
                call_details["note"] = "Call completed without AI voice due to Ultravox service unavailability."
                return call_details
            else:
                # Re-raise the original exception
                raise
        
    except Exception as e:
        logger.error(f"Call initiation failed: {str(e)}", exc_info=True)
        status_code = 500
        
        # Provide more specific error codes based on the exception
        if "invalid phone number" in str(e).lower():
            status_code = 400
        elif "invalid ultravox url" in str(e).lower():
            status_code = 400
        elif "ultravox service" in str(e).lower() and ("unavailable" in str(e).lower() or "not responding" in str(e).lower()):
            status_code = 502  # Map to the 502 Bad Gateway seen in the error
        elif "configuration" in str(e).lower() or "credentials" in str(e).lower():
            status_code = 503
            
        raise HTTPException(status_code=status_code, detail=str(e))

@router.post("/bulk")
async def bulk_call_campaign(request: BulkCallRequest, user=Depends(verify_token)):
    """
    Initiate bulk calls to multiple phone numbers
    """
    results = []
    for number in request.phone_numbers:
        try:
            # Simulate or actually initiate call for each number
            result = await initiate_call(number, "+1234567890")
            results.append(result)
        except Exception as e:
            results.append({
                "number": number, 
                "status": "failed", 
                "error": str(e)
            })
    
    return {
        "total_numbers": len(request.phone_numbers),
        "results": results
    }

@router.get("/history", response_model=List[CallLog])
async def get_call_history(
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,
    user=Depends(verify_token)
):
    """
    Retrieve paginated call history from the database.
    """
    try:
        query = """
            SELECT id, call_sid, from_number, to_number, direction, status, start_time, end_time, duration, recording_url, transcription, cost, segments, ultravox_cost, created_at
            FROM calls
        """
        conditions = []
        values = []

        if status:
            conditions.append("status = %s")
            values.append(status)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY start_time DESC LIMIT %s OFFSET %s"
        values.extend([limit, (page - 1) * limit])

        # Execute the query
        rows = await db.execute(query, values)

        # Convert rows to CallLog objects
        call_logs = [CallLog(**row) for row in rows]

        return call_logs
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clients")
async def create_client(client: Client, user=Depends(verify_token)):
    """
    Create a new client
    """
    try:
        query = """
            INSERT INTO clients (name, phone_number, email, address)
            VALUES (%s, %s, %s, %s)
        """
        values = (client.name, client.phone_number, client.email, client.address)
        await db.execute(query, values)
        return {"message": "Client created successfully", "client": client}
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/clients/{client_id}")
async def update_client(client_id: int, client: Client, user=Depends(verify_token)):
    """
    Update an existing client
    """
    try:
        query = """
            UPDATE clients
            SET name = %s, phone_number = %s, email = %s, address = %s
            WHERE id = %s
        """
        values = (client.name, client.phone_number, client.email, client.address, client_id)
        await db.execute(query, values)
        return {"message": "Client updated successfully", "client": client}
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/clients/{client_id}")
async def delete_client(client_id: int, user=Depends(verify_token)):
    """
    Delete a client
    """
    try:
        query = "DELETE FROM clients WHERE id = %s"
        await db.execute(query, (client_id,))
        return {"message": "Client deleted successfully", "client_id": client_id}
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clients/import")
async def import_clients(clients: List[Client], user=Depends(verify_token)):
    """
    Import clients from Google Sheet (simulated)
    """
    # In a real application, you would store this data in the database
    # For this example, we just return the data
    return {
        "message": "Clients imported successfully (simulated)",
        "clients": clients
    }

@router.get("/{call_sid}")
async def get_call_details(call_sid: str, user=Depends(verify_token)):
    """
    Get detailed information about a specific call
    """
    try:
        # Get call details from Twilio service
        call_details = await twilio_service.get_call_details(call_sid)
        
        # Get additional details from database
        query = """
            SELECT transcription, ultravox_cost, segments
            FROM calls
            WHERE call_sid = %s
        """
        rows = await db.execute(query, (call_sid,))
        
        # Merge the data
        if rows and len(rows) > 0:
            db_data = rows[0]
            call_details.update({
                "transcription": db_data.get("transcription"),
                "ultravox_cost": db_data.get("ultravox_cost"),
                "segments": db_data.get("segments")
            })
        
        return call_details
    except Exception as e:
        logger.error(f"Error fetching call details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/incoming-call")
async def incoming_call(request: Request):
    """
    Handle the inbound call from Twilio.
    """
    try:
        form_data = await request.form()
        twilio_params = dict(form_data)
        logger.info(f"Incoming call received: {twilio_params}")

        caller_number = twilio_params.get('From', 'Unknown')
        call_sid = twilio_params.get('CallSid')

        if not call_sid:
            logger.error("Missing CallSid in Twilio request")
            raise HTTPException(status_code=400, detail="Missing CallSid parameter")

        # Use the configured server domain from settings
        server_domain = settings.server_domain
        stream_url = f"wss://{server_domain}/media-stream"

        logger.info(f"Creating TwiML response with stream URL: {stream_url}")
        twiml = VoiceResponse()
        connect = Connect()
        stream = Stream(url=stream_url)
        stream.parameter(name="callSid", value=call_sid)
        stream.parameter(name="callerNumber", value=caller_number)
        connect.append(stream)
        twiml.append(connect)

        # Log the TwiML for debugging
        twiml_str = str(twiml)
        logger.debug(f"Generated TwiML: {twiml_str}")

        # Important: Set Content-Type to text/xml for Twilio
        return Response(
            content=twiml_str, 
            media_type="text/xml", 
            headers={"Content-Type": "text/xml; charset=utf-8"}
        )
    except Exception as e:
        logger.error(f"Error handling incoming call: {str(e)}", exc_info=True)
        # Still return valid TwiML even in case of error to avoid Twilio retry cycles
        error_twiml = VoiceResponse()
        error_twiml.say("We're sorry, but we're experiencing technical difficulties. Please try your call again later.")
        error_twiml.hangup()
        return Response(
            content=str(error_twiml), 
            media_type="text/xml",
            headers={"Content-Type": "text/xml; charset=utf-8"}
        )
