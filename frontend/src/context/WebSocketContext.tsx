// frontend/src/context/WebSocketContext.tsx

import React, { createContext, useContext, useEffect } from 'react';
import { websocketService } from '../services/websocket';
import { useAuth } from './AuthContext';

interface WebSocketContextType {
    sendMessage: (type: string, data: any) => void;
    joinCall: (callSid: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
    sendMessage: () => {},
    joinCall: () => {}
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, token } = useAuth();

    useEffect(() => {
        if (user && token) {
            websocketService.connect(user.id, token);

            return () => {
                websocketService.disconnect();
            };
        }
    }, [user, token]);

    const value = {
        sendMessage: websocketService.sendMessage.bind(websocketService),
        joinCall: websocketService.joinCall.bind(websocketService)
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => useContext(WebSocketContext);
