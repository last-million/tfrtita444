# backend/app/websockets/media_stream.py

import logging
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..services.ultravox_service import ultravox_service
from ..database import db
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    """
    WebSocket endpoint for handling media streaming between Twilio and Ultravox.
    This endpoint is called by Twilio's <Stream> TwiML verb.
    """
    await websocket.accept()
    call_sid = None
    caller_number = None
    session_id = None
    
    try:
        # Get connection parameters
        params = websocket.query_params
        call_sid = params.get("callSid")
        caller_number = params.get("callerNumber")
        
        if not call_sid:
            logger.error("No CallSid provided in WebSocket connection")
            await websocket.close(code=1000)
            return
            
        logger.info(f"Media stream WebSocket connected for call {call_sid}")
        
        # Create a unique session ID for this call
        session_id = f"call_{call_sid}_{datetime.now().timestamp()}"
        
        # Log the call in the database if it doesn't exist
        existing_call = await db.execute(
            "SELECT id FROM calls WHERE call_sid = %s",
            (call_sid,)
        )
        
        if not existing_call:
            # This is a new inbound call
            query = """
                INSERT INTO calls (
                    call_sid, from_number, to_number, status,
                    start_time, direction
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            values = (
                call_sid,
                caller_number or "Unknown",
                "Inbound Call",  # This is an inbound call
                "in-progress",
                datetime.utcnow(),
                'inbound'
            )
            await db.execute(query, values)
        
        # Process the media stream between Twilio and Ultravox
        await ultravox_service.process_media_stream(
            websocket=websocket,
            call_sid=call_sid,
            session_id=session_id
        )
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for call {call_sid}")
    except Exception as e:
        logger.error(f"Error in media stream: {str(e)}")
    finally:
        # Update call status to completed if it was disconnected
        if call_sid:
            try:
                query = """
                    UPDATE calls
                    SET status = %s,
                        end_time = %s
                    WHERE call_sid = %s AND status = 'in-progress'
                """
                values = ("completed", datetime.utcnow(), call_sid)
                await db.execute(query, values)
                logger.info(f"Call {call_sid} marked as completed")
            except Exception as e:
                logger.error(f"Error updating call status: {str(e)}")