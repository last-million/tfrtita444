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
    to_number: str = Query(..., title="The number to call"),
    from_number: str = Query("+1234567890", title="Twilio From Number"),
    ultravox_url: Optional[str] = Query(None, title="Ultravox WebSocket URL"),
    user=Depends(verify_token)
):
    """
    Initiate an outbound call via Twilio, optionally connecting to Ultravox
    """
    try:
        call_details = await twilio_service.make_call(to_number, from_number, ultravox_url)
        return call_details
    except Exception as e:
        logger.error(f"Call initiation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    form_data = await request.form()
    twilio_params = dict(form_data)
    print('Incoming call')

    caller_number = twilio_params.get('From', 'Unknown')
    call_sid = twilio_params.get('CallSid')

    # Use the configured server domain from settings
    server_domain = settings.server_domain
    stream_url = f"wss://{server_domain}/media-stream"

    twiml = VoiceResponse()
    connect = Connect()
    stream = Stream(url=stream_url)
    stream.parameter(name="callSid", value=call_sid)
    stream.parameter(name="callerNumber", value=caller_number)
    connect.append(stream)
    twiml.append(connect)

    return Response(content=str(twiml), media_type="application/xml")
