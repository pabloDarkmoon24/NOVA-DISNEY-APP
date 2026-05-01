import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = authService.getUser();
    const token = authService.getToken();

    if (savedUser && token) {
      setUser(savedUser);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    if (response.success) {
      authService.saveSession(response.data.token, response.data.user);
      setUser(response.data.user);
    }
    return response;
  };

  const register = async (name, email, password, clientId, clientSecret) => {
    const response = await authService.register(name, email, password, clientId, clientSecret);
    if (response.success) {
      authService.saveSession(response.data.token, response.data.user);
      setUser(response.data.user);
    }
    return response;
  };

  const logout = () => {
    authService.clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}