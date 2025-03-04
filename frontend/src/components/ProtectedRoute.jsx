// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, adminRequired = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return <div className="auth-loading">Verifying access...</div>;
  }

  // Check if user is authenticated
  if (!user) {
    // Redirect to login with return path
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Check if admin access is required
  if (adminRequired && user.username !== 'hamza') {
    // User is logged in but not hamza (admin)
    return (
      <div className="access-denied">
        <h1>Access Denied</h1>
        <p>You need administrator privileges to access this section.</p>
      </div>
    );
  }

  // User is authenticated and has required permissions
  return children;
};

export default ProtectedRoute;
