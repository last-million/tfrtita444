// frontend/src/services/websocket.ts

class WebSocketService {
    private socket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimeout = 1000; // Start with 1 second
    private messageHandlers: Map<string, Function[]> = new Map();

    constructor() {
        this.initializeHandlers();
    }

    private initializeHandlers() {
        // Initialize default message type handlers
        this.messageHandlers.set('call_status', []);
        this.messageHandlers.set('connection_status', []);
        this.messageHandlers.set('error', []);
    }

    connect(userId: number, token: string) {
        if (this.socket?.readyState === WebSocket.OPEN) return;

        const wsUrl = `${import.meta.env.VITE_WEBSOCKET_URL}/${userId}?token=${token}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.reconnectTimeout = 1000;
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.reconnect(userId, token);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    private reconnect(userId: number, token: string) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        setTimeout(() => {
            this.reconnectAttempts++;
            this.reconnectTimeout *= 2; // Exponential backoff
            this.connect(userId, token);
        }, this.reconnectTimeout);
    }

    addMessageHandler(type: string, handler: Function) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type)?.push(handler);
    }

    removeMessageHandler(type: string, handler: Function) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    private handleMessage(message: any) {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => handler(message.data));
        }
    }

    sendMessage(type: string, data: any) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, data }));
        } else {
            console.error('WebSocket is not connected');
        }
    }

    joinCall(callSid: string) {
        this.sendMessage('join_call', { call_sid: callSid });
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

export const websocketService = new WebSocketService();
