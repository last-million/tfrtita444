from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

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
    scheduled_meeting: Optional[str] = None
    email_sent: Optional[bool] = None
    email_address: Optional[str] = None
    email_text: Optional[str] = None
    email_received: Optional[bool] = None
    email_received_text: Optional[str] = None
    agent_hung_up: Optional[bool] = None

class BulkCallRequest(BaseModel):
    phone_numbers: List[str]
    message_template: Optional[str] = None

class Client(BaseModel):
    id: Optional[int] = None
    name: str
    phone_number: str
    email: Optional[str] = None
    address: Optional[str] = None  # Add address field
