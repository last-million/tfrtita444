# backend/app/websockets/handler.py

import json
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
from ..database import db

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.call_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        """Connect a new websocket client"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        await self.send_connection_status(user_id)

    async def disconnect(self, websocket: WebSocket, user_id: int):
        """Disconnect a websocket client"""
        self.active_connections[user_id].remove(websocket)
        if not self.active_connections[user_id]:
            del self.active_connections[user_id]
        # Remove from call connections if present
        for call_sid, ws in self.call_connections.items():
            if ws == websocket:
                del self.call_connections[call_sid]
                break

    async def connect_to_call(self, websocket: WebSocket, call_sid: str):
        """Connect websocket to a specific call"""
        self.call_connections[call_sid] = websocket
        await self.send_call_status(call_sid)

    async def broadcast_to_user(self, user_id: int, message: dict):
        """Send message to all connections of a user"""
        if user_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except:
                    dead_connections.append(connection)
            
            # Clean up dead connections
            for dead in dead_connections:
                await self.disconnect(dead, user_id)

    async def send_call_update(self, call_sid: str, update: dict):
        """Send update about a specific call"""
        if call_sid in self.call_connections:
            try:
                await self.call_connections[call_sid].send_json(update)
            except:
                del self.call_connections[call_sid]

    async def send_connection_status(self, user_id: int):
        """Send initial connection status and data"""
        try:
            # Get active calls
            active_calls = await db.fetch_all(
                "SELECT * FROM calls WHERE status = 'in-progress'"
            )
            
            # Get recent activities
            recent_activities = await db.fetch_all(
                """
                SELECT * FROM (
                    SELECT 'call' as type, start_time as timestamp, call_sid as id 
                    FROM calls
                    UNION ALL
                    SELECT 'email' as type, sent_at as timestamp, message_id as id 
                    FROM sent_emails
                    UNION ALL
                    SELECT 'meeting' as type, start_time as timestamp, event_id as id 
                    FROM calendar_events
                ) as activities
                ORDER BY timestamp DESC
                LIMIT 10
                """
            )

            await self.broadcast_to_user(user_id, {
                "type": "connection_status",
                "data": {
                    "active_calls": active_calls,
                    "recent_activities": recent_activities
                }
            })
        except Exception as e:
            logger.error(f"Error sending connection status: {str(e)}")

    async def send_call_status(self, call_sid: str):
        """Send current call status"""
        try:
            call_data = await db.fetch_one(
                "SELECT * FROM calls WHERE call_sid = %s",
                (call_sid,)
            )
            if call_data and call_sid in self.call_connections:
                await self.call_connections[call_sid].send_json({
                    "type": "call_status",
                    "data": call_data
                })
        except Exception as e:
            logger.error(f"Error sending call status: {str(e)}")

# Create global instance
websocket_manager = WebSocketManager()

# Now create the WebSocket routes
from fastapi import APIRouter, Depends
from ..middleware.auth import verify_token

router = APIRouter()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
    token: str = Depends(verify_token)
):
    try:
        await websocket_manager.connect(websocket, user_id)
        while True:
            try:
                message = await websocket.receive_json()
                
                # Handle different message types
                if message["type"] == "join_call":
                    await websocket_manager.connect_to_call(
                        websocket,
                        message["call_sid"]
                    )
                
                # Handle other message types as needed
                
            except WebSocketDisconnect:
                await websocket_manager.disconnect(websocket, user_id)
                break
            except Exception as e:
                logger.error(f"Error processing websocket message: {str(e)}")
                
    except Exception as e:
        logger.error(f"Error in websocket connection: {str(e)}")
        if websocket.client_state.CONNECTED:
            await websocket.close(code=1000)
