import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
});

// Inyectar token en cada request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Si la sesión expiró, limpiar y redirigir. En errores de red, reintentar una vez.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthRoute = url.includes('/auth/');

      // Solo cerrar sesión cuando el 401 viene de nuestro propio middleware JWT
      // (rutas /auth/ o cualquier ruta con token inválido/expirado).
      // Los 401 de proveedores externos (Nova API) se remapean a 511 en el backend,
      // pero esta doble comprobación evita cierres de sesión falsos en cualquier caso.
      const isOurAuth = isAuthRoute || !url.includes('/nova/');

      if (isOurAuth) {
        const token = localStorage.getItem('token');
        if (token) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }

    // Error de red o timeout sin respuesta del servidor: reintentar una vez
    // Excluir endpoints de compra masiva — un reintento causaría cobros dobles
    const isNonRetryable =
      error.config?.url?.includes('/nova/bulk/execute') ||
      error.config?.url?.includes('/nova/quick');
    if (!error.response && error.config && !error.config._retried && !isNonRetryable) {
      error.config._retried = true;
      await new Promise((r) => setTimeout(r, 1000));
      return api(error.config);
    }

    return Promise.reject(error);
  }
);

export default api;