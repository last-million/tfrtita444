// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  // Always render children without checking authentication
  // This effectively bypasses the login requirement
  return children;
};

export default ProtectedRoute;
