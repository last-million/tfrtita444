# backend/app/monitoring/metrics.py

from prometheus_client import Counter, Histogram, Gauge
import time
from typing import Dict, Optional
from functools import wraps

# Define metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

active_websocket_connections = Gauge(
    'active_websocket_connections',
    'Number of active WebSocket connections'
)

active_calls = Gauge(
    'active_calls',
    'Number of active calls'
)

call_duration_seconds = Histogram(
    'call_duration_seconds',
    'Call duration in seconds'
)

class MetricsCollector:
    def __init__(self):
        self.start_time = time.time()

    def track_request(self):
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                start_time = time.time()
                try:
                    response = await func(*args, **kwargs)
                    status = response.status_code
                except Exception as e:
                    status = 500
                    raise e
                finally:
                    duration = time.time() - start_time
                    http_requests_total.labels(
                        method=kwargs.get('request').method,
                        endpoint=kwargs.get('request').url.path,
                        status=status
                    ).inc()
                    http_request_duration_seconds.labels(
                        method=kwargs.get('request').method,
                        endpoint=kwargs.get('request').url.path
                    ).observe(duration)
                return response
            return wrapper
        return decorator

    def track_websocket_connection(self, connected: bool = True):
        if connected:
            active_websocket_connections.inc()
        else:
            active_websocket_connections.dec()

    def track_call(self, started: bool = True):
        if started:
            active_calls.inc()
        else:
            active_calls.dec()

    def record_call_duration(self, duration: float):
        call_duration_seconds.observe(duration)

metrics_collector = MetricsCollector()
