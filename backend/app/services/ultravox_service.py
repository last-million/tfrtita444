# backend/app/services/ultravox_service.py

import os
import asyncio
import json
import logging
import audioop
import base64
from datetime import datetime
import websockets
import requests
from typing import Dict, Optional, List, Any, Union
from urllib.parse import urlparse
import tenacity
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import backoff
from ..config import settings
from ..database import db

logger = logging.getLogger(__name__)

class UltravoxService:
    def __init__(self):
        self.api_key = settings.ultravox_api_key
        self.base_url = "https://api.ultravox.ai/api/calls"
        self.model = "fixie-ai/ultravox-70B"  # Updated to match Ultravox docs
        self.sample_rate = 16000  # Higher quality audio
        self.buffer_size = 60
        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }

    def is_valid_url(self, url: str) -> bool:
        """
        Validate if a URL is properly formatted and could be a valid Ultravox URL
        """
        if not url:
            return False
            
        try:
            result = urlparse(url)
            # Check for basic URL validity
            valid_scheme = result.scheme in ('http', 'https', 'wss', 'ws')
            valid_netloc = bool(result.netloc)
            
            # Check for Ultravox-specific patterns
            ultravox_pattern = (
                'ultravox.ai' in result.netloc or
                'api.ultravox' in result.netloc or
                result.scheme == 'wss'
            )
            
            return valid_scheme and valid_netloc and ultravox_pattern
        except Exception as e:
            logger.error(f"URL validation error: {str(e)}")
            return False

    # Configure retry decorator with exponential backoff for API calls
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((requests.exceptions.Timeout, requests.exceptions.ConnectionError)),
        before_sleep=lambda retry_state: logger.warning(
            f"Ultravox API call failed. Retrying in {retry_state.next_action.sleep} seconds... "
            f"(Attempt {retry_state.attempt_number}/3)"
        )
    )
    def _make_api_request(self, payload: Dict) -> Dict:
        """Make a request to the Ultravox API with retry logic"""
        try:
            # Add timeout to prevent long-hanging requests
            response = requests.post(
                self.base_url,
                headers=self.headers,
                json=payload,
                timeout=30  # 30 second timeout
            )
            
            if not response.ok:
                status_code = response.status_code
                error_text = response.text
                logger.error(f"Ultravox create call error: {status_code} {error_text}")
                
                # Check for common errors and provide better messages
                if status_code == 502:
                    raise Exception("Ultravox service returned a 502 Bad Gateway error. The service may be temporarily unavailable.")
                elif status_code == 401:
                    raise Exception("Authentication failed with Ultravox API. Please check your API key.")
                elif status_code == 400:
                    raise Exception(f"Invalid request to Ultravox API: {error_text}")
                else:
                    raise Exception(f"Failed to create Ultravox call: {error_text}")

            return response.json()
        except requests.exceptions.Timeout:
            logger.error("Ultravox API request timed out")
            raise Exception("The Ultravox service is not responding. Please try again later.")
        except requests.exceptions.ConnectionError:
            logger.error("Ultravox API connection error")
            raise Exception("Could not connect to the Ultravox service. Please check network connectivity.")
        except Exception as e:
            # Re-raise any other exceptions
            logger.error(f"Error in Ultravox API request: {str(e)}")
            raise

    async def create_call_session(
        self, 
        system_prompt: str, 
        first_message: str, 
        voice: str = "Mark",  # Updated to match documented default
        language_hint: str = "en",
        call_history: str = "",
        knowledge_base_access: bool = True
    ) -> Dict:
        """Create a new Ultravox call session with support for multiple languages and knowledge base"""
        try:
            # Prepare context with knowledge base if enabled
            context = f"{system_prompt}"
            if call_history:
                context += f"\n\nPrevious Call History:\n{call_history}"
            
            # Knowledge base access would be configured separately in a real implementation
            # This would typically involve connecting to a vector database

            payload = {
                "systemPrompt": context,
                "model": self.model,
                "voice": voice,
                "temperature": 0.3,  # Slightly higher for more varied responses
                "languageHint": language_hint,  # Support for multiple languages
                "initialMessages": [
                    {
                        "role": "MESSAGE_ROLE_USER",
                        "text": first_message
                    }
                ],
                "medium": {
                    "serverWebSocket": {
                        "inputSampleRate": self.sample_rate,
                        "outputSampleRate": self.sample_rate,
                        "clientBufferSizeMs": self.buffer_size
                    }
                },
                "selectedTools": self._get_default_tools(),
                "recordingEnabled": True  # Enable call recording by default
            }

            # Use the retry-enabled API request method
            data = self._make_api_request(payload)
            
            return {
                "join_url": data.get("joinUrl"),
                "call_id": data.get("callId"),
                "voice": voice,
                "language": language_hint
            }

        except Exception as e:
            logger.error(f"Error creating Ultravox call: {str(e)}")
            raise

    async def process_media_stream(
        self,
        websocket: websockets.WebSocketClientProtocol,
        call_sid: str,
        session_id: str
    ):
        """Handle media streaming between Twilio and Ultravox"""
        ultravox_ws = None
        transcription = []
        call_duration = 0
        start_time = datetime.now()

        try:
            # Connect to Ultravox WebSocket
            try:
                session = await self.create_call_session(
                    system_prompt="You are an AI assistant helping with customer inquiries.",
                    first_message="Hello! How can I help you today?"
                )
                
                if not session.get('join_url'):
                    raise Exception("Missing join_url in Ultravox session response")
                
                join_url = session['join_url']
                
                # Validate the join URL
                if not self.is_valid_url(join_url):
                    raise Exception(f"Invalid Ultravox WebSocket URL: {join_url}")
                
                # Add timeout to WebSocket connection
                ultravox_ws = await asyncio.wait_for(
                    websockets.connect(join_url),
                    timeout=15  # 15 second connection timeout
                )
                
                logger.info(f"Connected to Ultravox WebSocket for call {call_sid}")
            except asyncio.TimeoutError:
                logger.error(f"Timeout connecting to Ultravox WebSocket for call {call_sid}")
                raise Exception("Connection to Ultravox timed out")
            except Exception as e:
                logger.error(f"Failed to connect to Ultravox: {str(e)}")
                raise

            async def handle_ultravox_messages():
                try:
                    async for message in ultravox_ws:
                        if isinstance(message, bytes):
                            # Handle audio data from Ultravox
                            mu_law_audio = audioop.lin2ulaw(message, 2)
                            payload = {
                                "event": "media",
                                "streamSid": session_id,
                                "media": {
                                    "payload": base64.b64encode(mu_law_audio).decode('ascii')
                                }
                            }
                            try:
                                await websocket.send(json.dumps(payload))
                                logger.debug(f"Sent audio data to Twilio for call {call_sid}")
                            except Exception as e:
                                logger.error(f"Error sending audio to Twilio: {e}")
                                break # Exit the loop if sending fails
                        else:
                            # Handle text messages from Ultravox
                            msg_data = json.loads(message)
                            msg_type = msg_data.get("type")

                            if msg_type == "transcript":
                                await self._handle_transcript(msg_data, transcription)
                            elif msg_type == "client_tool_invocation":
                                await self._handle_tool_invocation(
                                    ultravox_ws, 
                                    msg_data, 
                                    call_sid
                                )

                except Exception as e:
                    logger.error(f"Error in Ultravox message handler: {str(e)}")

            # Start Ultravox message handler
            ultravox_task = asyncio.create_task(handle_ultravox_messages())

            # Handle Twilio WebSocket messages
            try:
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        if data.get("event") == "media":
                            # Convert Twilio µ-law to PCM
                            audio_data = base64.b64decode(data["media"]["payload"])
                            pcm_data = audioop.ulaw2lin(audio_data, 2)
                            
                            # Send to Ultravox
                            if ultravox_ws and ultravox_ws.open:
                                await ultravox_ws.send(pcm_data)
                                logger.debug(f"Sent audio data to Ultravox for call {call_sid}")
                    except json.JSONDecodeError:
                        logger.error("Invalid JSON from Twilio WebSocket")
                    except Exception as e:
                        logger.error(f"Error processing Twilio message: {str(e)}")

            except Exception as e:
                logger.error(f"Error in Twilio WebSocket handler: {str(e)}")
            finally:
                if not ultravox_task.done():
                    ultravox_task.cancel()

        except Exception as e:
            logger.error(f"Error in media stream processing: {str(e)}")
        finally:
            if ultravox_ws:
                try:
                    await ultravox_ws.close()
                except Exception as close_error:
                    logger.error(f"Error closing Ultravox WebSocket: {str(close_error)}")
            
            # Update call records
            end_time = datetime.now()
            call_duration = (end_time - start_time).seconds
            await self._update_call_record(
                call_sid,
                call_duration,
                transcription
            )

    async def _handle_transcript(self, msg_data: Dict, transcription: List):
        """Handle transcript messages from Ultravox"""
        role = msg_data.get("role")
        text = msg_data.get("text")
        if role and text:
            transcription.append({
                "role": role,
                "text": text,
                "timestamp": datetime.now().isoformat()
            })

    async def _handle_tool_invocation(
        self,
        ws: websockets.WebSocketClientProtocol,
        msg_data: Dict,
        call_sid: str
    ):
        """Handle tool invocation requests from Ultravox"""
        tool_name = msg_data.get("toolName")
        invocation_id = msg_data.get("invocationId")
        parameters = msg_data.get("parameters", {})

        try:
            # Updated to handle the new tools we added
            result = None
            
            if tool_name == "scheduleMeeting":
                result = await self._handle_schedule_meeting(parameters.get("meetingDetails", {}))
            elif tool_name == "sendEmail":
                result = await self._handle_send_email(parameters.get("emailContent", {}))
            elif tool_name == "hangUp" or tool_name == "hangup":
                result = await self._handle_hangup(call_sid)
                # Set response type for hangup
                response = {
                    "type": "client_tool_result",
                    "invocationId": invocation_id,
                    "result": result,
                    "responseType": "hang-up"  # Special response type for call termination
                }
                await ws.send(json.dumps(response))
                return
            elif tool_name == "lookupProductInfo":
                result = await self._handle_knowledge_search(parameters.get("query", ""))
            elif tool_name == "lookupOrder":
                result = await self._handle_order_lookup(parameters.get("orderIdentifier", {}))
            elif tool_name == "createSupportCase":
                result = await self._handle_create_support_case(parameters.get("caseDetails", {}))
            else:
                result = f"Unsupported tool: {tool_name}"

            # Standard response
            response = {
                "type": "client_tool_result",
                "invocationId": invocation_id,
                "result": result
            }
            await ws.send(json.dumps(response))

        except Exception as e:
            logger.error(f"Error handling tool {tool_name}: {str(e)}")
            error_response = {
                "type": "client_tool_result",
                "invocationId": invocation_id,
                "error": str(e)
            }
            await ws.send(json.dumps(error_response))

    async def _handle_schedule_meeting(self, meeting_details: Dict) -> str:
        """Handle scheduling a meeting"""
        # This would connect to a calendar API in a real implementation
        logger.info(f"Scheduling meeting: {json.dumps(meeting_details)}")
        return json.dumps({
            "success": True,
            "meetingId": f"meet-{datetime.now().timestamp():.0f}",
            "message": "Meeting scheduled successfully. Invitations have been sent to all attendees."
        })

    async def _handle_send_email(self, email_content: Dict) -> str:
        """Handle sending an email"""
        # This would connect to an email API in a real implementation
        logger.info(f"Sending email: {json.dumps(email_content)}")
        return json.dumps({
            "success": True,
            "emailId": f"email-{datetime.now().timestamp():.0f}",
            "message": "Email sent successfully."
        })

    async def _handle_hangup(self, call_sid: str) -> str:
        """Handle hanging up a call"""
        logger.info(f"Hanging up call {call_sid}")
        # In a real implementation, this might tell Twilio to hang up
        # Or it might just return and rely on the special hang-up response type
        return json.dumps({
            "success": True,
            "message": "Call terminated by AI agent."
        })

    async def _handle_knowledge_search(self, query: str) -> str:
        """Handle knowledge base search"""
        # This would connect to a vector database in a real implementation
        logger.info(f"Searching knowledge base for: {query}")
        # Mock response
        return json.dumps({
            "success": True,
            "results": [
                {
                    "content": "Product XYZ supports all major operating systems including Windows, macOS, and Linux.",
                    "source": "Product Documentation",
                    "relevance": 0.92
                },
                {
                    "content": "The premium subscription costs $49.99 per month and includes all features.",
                    "source": "Pricing Guide",
                    "relevance": 0.87
                }
            ]
        })

    async def _handle_order_lookup(self, order_identifier: Dict) -> str:
        """Handle order lookup"""
        # This would connect to an order database in a real implementation
        logger.info(f"Looking up order: {json.dumps(order_identifier)}")
        return json.dumps({
            "success": True,
            "order": {
                "orderId": "ORD-12345",
                "status": "Shipped",
                "items": [
                    {"name": "Product A", "quantity": 2, "price": 19.99},
                    {"name": "Product B", "quantity": 1, "price": 29.99}
                ],
                "total": 69.97,
                "shippingDetails": {
                    "carrier": "USPS",
                    "trackingNumber": "9400123456789012345678",
                    "estimatedDelivery": "2025-02-05"
                }
            }
        })

    async def _handle_create_support_case(self, case_details: Dict) -> str:
        """Handle creating a support case"""
        # This would connect to a CRM system in a real implementation
        logger.info(f"Creating support case: {json.dumps(case_details)}")
        return json.dumps({
            "success": True,
            "caseId": f"CASE-{datetime.now().timestamp():.0f}",
            "message": "Support case created successfully. A support agent will contact you within 24 hours.",
            "priority": case_details.get("priority", "medium")
        })

    def _get_default_tools(self) -> List[Dict]:
        """Get default tools configuration based on Ultravox documentation"""
        return [
            # Use built-in hangUp tool
            {
                "toolName": "hangUp"
            },
            # Knowledge Base Tool
            {
                "temporaryTool": {
                    "modelToolName": "lookupProductInfo",
                    "description": "Searches official product documentation using semantic similarity to find relevant information. Use this tool to look up specific product features, specifications, limitations, pricing, or support information.",
                    "dynamicParameters": [
                        {
                            "name": "query",
                            "location": "PARAMETER_LOCATION_BODY",
                            "schema": {
                                "description": "A specific, focused search query to find relevant product information",
                                "type": "string"
                            },
                            "required": True
                        }
                    ],
                    "http": {
                        "baseUrlPattern": "https://api.example.com/knowledge_base/search",
                        "httpMethod": "POST"
                    }
                }
            },
            # Schedule meeting tool
            {
                "temporaryTool": {
                    "modelToolName": "scheduleMeeting",
                    "description": "Schedule a meeting and send invitations to all participants",
                    "dynamicParameters": [
                        {
                            "name": "meetingDetails",
                            "location": "PARAMETER_LOCATION_BODY",
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "dateTime": { 
                                        "type": "string", 
                                        "description": "Meeting date and time in ISO format (YYYY-MM-DDTHH:MM:SS)" 
                                    },
                                    "duration": { 
                                        "type": "integer", 
                                        "description": "Meeting duration in minutes" 
                                    },
                                    "subject": { 
                                        "type": "string", 
                                        "description": "Meeting subject line" 
                                    },
                                    "description": { 
                                        "type": "string", 
                                        "description": "Meeting description/agenda" 
                                    },
                                    "attendees": { 
                                        "type": "array", 
                                        "items": {"type": "string"},
                                        "description": "List of attendee email addresses" 
                                    }
                                },
                                "required": ["dateTime", "duration", "subject", "attendees"]
                            },
                            "required": True
                        }
                    ],
                    "client": {}
                }
            },
            # Send email follow-up tool
            {
                "temporaryTool": {
                    "modelToolName": "sendEmail",
                    "description": "Send follow-up email with conversation summary and any requested information",
                    "dynamicParameters": [
                        {
                            "name": "emailContent",
                            "location": "PARAMETER_LOCATION_BODY",
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "to": { 
                                        "type": "string", 
                                        "description": "Recipient email address" 
                                    },
                                    "subject": { 
                                        "type": "string", 
                                        "description": "Email subject line" 
                                    },
                                    "body": { 
                                        "type": "string", 
                                        "description": "Email body content" 
                                    },
                                    "includeTranscript": { 
                                        "type": "boolean", 
                                        "description": "Whether to include the call transcript" 
                                    }
                                },
                                "required": ["to", "subject", "body"]
                            },
                            "required": True
                        }
                    ],
                    "client": {}
                }
            },
            # Order lookup tool
            {
                "temporaryTool": {
                    "modelToolName": "lookupOrder",
                    "description": "Look up details about a customer order by order number or customer email",
                    "dynamicParameters": [
                        {
                            "name": "orderIdentifier",
                            "location": "PARAMETER_LOCATION_BODY", 
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "orderNumber": { 
                                        "type": "string", 
                                        "description": "Order number to look up" 
                                    },
                                    "customerEmail": { 
                                        "type": "string", 
                                        "description": "Customer email to look up orders for" 
                                    }
                                },
                                "required": []
                            },
                            "required": True
                        }
                    ],
                    "http": {
                        "baseUrlPattern": "https://api.example.com/orders/lookup",
                        "httpMethod": "POST"
                    }
                }
            },
            # Create support case tool
            {
                "temporaryTool": {
                    "modelToolName": "createSupportCase",
                    "description": "Create a support case for issues requiring human follow-up",
                    "dynamicParameters": [
                        {
                            "name": "caseDetails",
                            "location": "PARAMETER_LOCATION_BODY",
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "priority": { 
                                        "type": "string", 
                                        "enum": ["low", "medium", "high", "urgent"],
                                        "description": "Case priority level" 
                                    },
                                    "subject": { 
                                        "type": "string", 
                                        "description": "Brief summary of the issue" 
                                    },
                                    "description": { 
                                        "type": "string", 
                                        "description": "Detailed description of the issue" 
                                    },
                                    "customerEmail": { 
                                        "type": "string", 
                                        "description": "Customer's email address" 
                                    },
                                    "customerName": { 
                                        "type": "string", 
                                        "description": "Customer's name" 
                                    }
                                },
                                "required": ["priority", "subject", "description", "customerEmail"]
                            },
                            "required": True
                        }
                    ],
                    "http": {
                        "baseUrlPattern": "https://api.example.com/support/create_case",
                        "httpMethod": "POST"
                    }
                }
            }
        ]

    async def _update_call_record(
        self,
        call_sid: str,
        duration: int,
        transcription: List[Dict]
    ):
        """Update call record with final details"""
        try:
            query = """
                UPDATE calls
                SET duration = %s,
                    transcription = %s,
                    end_time = %s,
                    ultravox_cost = %s,
                    hang_up_by = %s
                WHERE call_sid = %s
            """
            
            # Determine who hung up by analyzing the last few transcript entries
            hang_up_by = "user"  # Default
            if transcription and len(transcription) > 1:
                last_messages = transcription[-3:]  # Look at last few messages
                for msg in reversed(last_messages):
                    if msg.get("role") == "agent" and any(x in msg.get("text", "").lower() 
                                                      for x in ["goodbye", "bye", "end", "hang up", "terminate"]):
                        hang_up_by = "agent"
                        break
            
            values = (
                duration,
                json.dumps(transcription),
                datetime.now(),
                self._calculate_cost(duration),
                hang_up_by,
                call_sid
            )
            await db.execute(query, values)
        except Exception as e:
            logger.error(f"Error updating call record: {str(e)}")

    def _calculate_cost(self, duration: int) -> float:
        """Calculate Ultravox cost based on call duration"""
        # Updated to match actual pricing from Ultravox documentation: $0.05 per minute
        return round((duration / 60) * 0.05, 2)

ultravox_service = UltravoxService()
