import api from './api';

const authService = {
  register: async (name, email, password, clientId, clientSecret) => {
    const response = await api.post('/auth/register', {
      name,
      email,
      password,
      clientId,
      clientSecret,
    });
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  saveSession: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clearSession: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getToken: () => localStorage.getItem('token'),

  getUser: () => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  },

  isAuthenticated: () => !!localStorage.getItem('token'),
};

export default authService;