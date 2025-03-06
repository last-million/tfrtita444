import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Import the service adapter early to register services before app initialization
import './utils/serviceAdapter';

// Prevent API errors from crashing the app
window.addEventListener('error', (event) => {
  // Check if error is related to API calls
  if (event.message && (
      event.message.includes('api') || 
      event.message.includes('Cannot read properties of undefined') ||
      event.message.includes('is not a function')
    )) {
    
    console.warn('Intercepted potential API error:', event.message);
    console.warn('This error was prevented from crashing the app');
    
    // Prevent the error from crashing the app
    event.preventDefault();
  }
});

// Add global catch-all for promises
window.addEventListener('unhandledrejection', (event) => {
  // Log but don't crash for API-related promise rejections
  if (event.reason && (
      (typeof event.reason.message === 'string' && 
       (event.reason.message.includes('api') || 
        event.reason.message.includes('network') ||
        event.reason.message.includes('Cannot read properties of undefined'))
      )
    )) {
    
    console.warn('Caught unhandled API promise rejection:', event.reason);
    console.warn('This promise rejection was prevented from crashing the app');
    
    // Prevent the rejection from crashing the app
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
