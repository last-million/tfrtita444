// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing authentication on load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        // Set the auth header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Verify token by calling the auth/me endpoint
        const response = await axios.get('/api/auth/me');
        
        // Set user data from the response
        setUser({
          username: response.data.username,
          isAdmin: response.data.is_admin,
        });
      } catch (error) {
        // Clear invalid auth data
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Login function to authenticate users
  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/token', {
        username,
        password
      });

      const { access_token } = response.data;
      
      // Store auth data
      localStorage.setItem('token', access_token);
      
      // Set auth header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      // Update user state
      setUser({
        username: username,
        isAdmin: username === 'hamza' // Assume hamza is admin
      });
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // Logout function
  const logout = () => {
    // Clear auth data
    localStorage.removeItem('token');
    
    // Remove auth header
    delete axios.defaults.headers.common['Authorization'];
    
    // Reset user state
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
