# backend/app/routes/dashboard.py

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List
import logging
from datetime import datetime, timedelta
from ..database import db
from ..middleware.auth import verify_token

router = APIRouter()

logger = logging.getLogger(__name__)

@router.get("/dashboard/stats")
async def get_dashboard_stats(user=Depends(verify_token)):
    """
    Retrieve dashboard statistics
    """
    try:
        # Total calls
        try:
            total_calls_query = "SELECT COUNT(*) FROM calls"
            total_calls_result = await db.execute(total_calls_query)
            total_calls = total_calls_result[0][0] if total_calls_result else 0
        except Exception:
            logger.warning("Error getting call count", exc_info=True)
            total_calls = 0

        # Active services
        try:
            active_services_query = "SELECT COUNT(*) FROM service_credentials WHERE is_connected = TRUE"
            active_services_result = await db.execute(active_services_query)
            active_services = active_services_result[0][0] if active_services_result else 0
        except Exception:
            logger.warning("Error getting active services count", exc_info=True)
            active_services = 0

        # Knowledge base documents
        try:
            knowledge_base_query = "SELECT COUNT(*) FROM knowledge_base_documents"
            knowledge_base_result = await db.execute(knowledge_base_query)
            knowledge_base_documents = knowledge_base_result[0][0] if knowledge_base_result else 0
        except Exception:
            logger.warning("Error getting knowledge base documents count", exc_info=True)
            knowledge_base_documents = 0

        # AI Accuracy (This is a placeholder, you'll need to implement actual logic)
        ai_response_accuracy = "85%"

        return {
            "totalCalls": total_calls,
            "activeServices": active_services,
            "knowledgeBaseDocuments": knowledge_base_documents,
            "aiResponseAccuracy": ai_response_accuracy
        }
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {e}")
        # Return default data instead of raising an exception
        return {
            "totalCalls": 0,
            "activeServices": 0,
            "knowledgeBaseDocuments": 0,
            "aiResponseAccuracy": "85%"
        }
        
@router.get("/dashboard/recent-activities")
async def get_recent_activities(user=Depends(verify_token)):
    """
    Retrieve recent activities for the dashboard
    """
    try:
        activities = []
        
        try:
            # Get recent calls (last 7 days)
            recent_calls_query = """
                SELECT call_sid, from_number, to_number, direction, start_time 
                FROM calls 
                ORDER BY start_time DESC 
                LIMIT 5
            """
            recent_calls = await db.execute(recent_calls_query)
            
            # Format call activities
            for call in recent_calls:
                call_time = call.get('start_time')
                time_diff = datetime.now() - call_time if call_time else timedelta(hours=1)
                hours_ago = int(time_diff.total_seconds() / 3600)
                
                activities.append({
                    "id": f"call_{call.get('call_sid')}",
                    "type": "Call",
                    "description": f"{call.get('direction').capitalize()} call to {call.get('to_number')}",
                    "timestamp": f"{hours_ago} hours ago" if hours_ago < 24 else f"{int(hours_ago/24)} days ago"
                })
        except Exception:
            logger.warning("Error fetching recent calls", exc_info=True)
        
        try:
            # Get recent document uploads (last 7 days)
            recent_docs_query = """
                SELECT id, filename, created_at 
                FROM knowledge_base_documents 
                ORDER BY created_at DESC 
                LIMIT 5
            """
            recent_docs = await db.execute(recent_docs_query)
            
            # Format document activities
            for doc in recent_docs:
                doc_time = doc.get('created_at')
                time_diff = datetime.now() - doc_time if doc_time else timedelta(hours=4)
                hours_ago = int(time_diff.total_seconds() / 3600)
                
                activities.append({
                    "id": f"doc_{doc.get('id')}",
                    "type": "Document",
                    "description": f"Vectorized \"{doc.get('filename')}\"",
                    "timestamp": f"{hours_ago} hours ago" if hours_ago < 24 else f"{int(hours_ago/24)} days ago"
                })
        except Exception:
            logger.warning("Error fetching recent documents", exc_info=True)
            
        # Sort activities by timestamp (most recent first)
        if activities:
            activities.sort(key=lambda x: int(x["timestamp"].split()[0]), reverse=False)
        
        return activities[:5]  # Return the 5 most recent activities
        
    except Exception as e:
        logger.error(f"Error fetching recent activities: {e}")
        # Return empty array instead of raising an exception
        return []
