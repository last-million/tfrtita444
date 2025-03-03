# backend/app/monitoring/middleware.py

from fastapi import Request
import time
from .metrics import metrics_collector

async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    metrics_collector.track_request(
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration=process_time
    )
    
    return response
