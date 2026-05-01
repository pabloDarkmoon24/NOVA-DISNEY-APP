import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import authService from '../services/authService';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  // user puede ser null un render antes de que React procese el setUser,
  // pero el token ya está en localStorage desde saveSession()
  if (!user && !authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}