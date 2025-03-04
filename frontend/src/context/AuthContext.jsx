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

  // Get API URL from environment variables
  // This will automatically use the right protocol (http or https) based on what's in the .env file
  // And will dynamically adjust if the app is served over HTTPS
  const API_URL = import.meta.env.VITE_API_URL || 
                 (window.location.protocol === 'https:' ? 
                  'https://ajingolik.fun/api' : 
                  'http://ajingolik.fun/api');

  useEffect(() => {
    // Check if user is already logged in
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Error parsing stored user:', e);
      }
    }
  }, []);

  // Login function - Fixed to use environment API URL
  const login = async (username, password) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Using auth endpoint at ${API_URL}/auth/token`);
      
      // Create form data
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      // Send request to auth server using environment variable
      const response = await fetch(`${API_URL}/auth/token`, {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }
      
      // Parse the response
      const data = await response.json();
      console.log("Login response:", data);
      
      // Extract token and user
      const access_token = data.access_token;
      const user = data.username;
      
      // Store auth information
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify({ username: user }));
      
      // Update state
      setToken(access_token);
      setUser({ username: user });
      
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
