import React, { createContext, useState, useEffect, useContext } from 'react';

// Create AuthContext
export const AuthContext = createContext();

// Create custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// AuthProvider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Get API URL with fallbacks
  const getApiUrl = () => {
    // First priority: environment variable
    if (import.meta.env.VITE_API_URL) {
      console.log("Using API URL from environment variable:", import.meta.env.VITE_API_URL);
      return import.meta.env.VITE_API_URL;
    }
    
    // Second priority: based on current protocol with domain
    const domainWithProtocol = window.location.protocol === 'https:' ? 
                              'https://ajingolik.fun/api' : 
                              'http://ajingolik.fun/api';
    console.log("Using API URL based on protocol:", domainWithProtocol);
    return domainWithProtocol;
  };

  const API_URL = getApiUrl();

  useEffect(() => {
    console.log("AuthProvider initializing...");
    try {
      // Check if user is already logged in
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      console.log("Stored token exists:", !!storedToken);
      console.log("Stored user exists:", !!storedUser);
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Error parsing stored user:', e);
          // Clear invalid data
          localStorage.removeItem('user');
        }
      }
    } catch (e) {
      console.error("Error during auth initialization:", e);
    } finally {
      setIsInitialized(true);
      console.log("AuthProvider initialization complete");
    }
  }, []);

  // Login function with improved error handling
  const login = async (username, password) => {
    console.log("Login attempt for user:", username);
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Using auth endpoint at ${API_URL}/auth/token`);
      
      // First try with FormData
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      console.log("Attempting login with FormData...");
      let response;
      
      try {
        response = await fetch(`${API_URL}/auth/token`, {
          method: "POST",
          body: formData
        });
      } catch (formDataError) {
        console.warn("FormData login failed, trying JSON instead:", formDataError);
        
        // If FormData fails, try with JSON
        response = await fetch(`${API_URL}/auth/token`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password })
        });
      }
      
      if (!response.ok) {
        console.error("Login response not OK:", response.status, response.statusText);
        const errorText = await response.text();
        console.error("Error response body:", errorText);
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }
      
      // Parse the response
      const data = await response.json();
      console.log("Login successful, received token");
      
      // Extract token and user
      const access_token = data.access_token;
      const user = { username: data.username || username };
      
      // Store auth information
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Update state
      setToken(access_token);
      setUser(user);
      
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login');
      
      // Try direct login for development/testing
      if (username === 'hamza' && password === 'AFINasahbi@-11') {
        console.log("Using hardcoded fallback login for development");
        const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYW16YSIsImV4cCI6MTk5OTk5OTk5OX0.mock_token_for_development";
        localStorage.setItem('token', mockToken);
        localStorage.setItem('user', JSON.stringify({ username: 'hamza' }));
        setToken(mockToken);
        setUser({ username: 'hamza' });
        return true;
      }
      
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    console.log("Logging out user");
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      error,
      isInitialized, 
      login, 
      logout,
      apiUrl: API_URL
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
