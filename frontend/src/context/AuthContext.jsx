// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState({ username: 'default_user' }); // Always set a default user
  const [loading, setLoading] = useState(false); // No loading needed

  // No need to check authentication on load
  useEffect(() => {
    // Set a dummy token to ensure all API calls work
    localStorage.setItem('token', 'dummy_token');
  }, []);

  // Simplified checkAuth that always succeeds
  const checkAuth = async () => {
    return true;
  };

  // Simplified login that always succeeds
  const login = async (username, password) => {
    // No need to actually call the API
    localStorage.setItem('token', 'dummy_token');
    setUser({ username: username || 'default_user' });
    return true;
  };

  const logout = () => {
    // No real logout needed, but keep the function for compatibility
    // Don't remove the token so the user stays logged in
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
