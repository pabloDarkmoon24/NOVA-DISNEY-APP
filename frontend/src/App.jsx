import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import HistoryPage from './pages/HistoryPage';
import BulkPage from './pages/BulkPage';
import QuickBuyPage from './pages/QuickBuyPage';
import TraceabilityPage from './pages/TraceabilityPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/bulk"      element={<ProtectedRoute><BulkPage /></ProtectedRoute>} />
          <Route path="/quick"     element={<ProtectedRoute><QuickBuyPage /></ProtectedRoute>} />
          <Route path="/history"   element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/traceability" element={<ProtectedRoute><TraceabilityPage /></ProtectedRoute>} />
          <Route path="/settings"  element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
