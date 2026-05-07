import api from './api';

const novaService = {
  getProducts: async () => {
    const response = await api.get('/nova/products');
    return response.data;
  },

  getBalance: async () => {
    const response = await api.get('/nova/balance');
    return response.data;
  },

  buyProduct: async (customerName, email, productId) => {
    const response = await api.post('/nova/buy', {
      customerName,
      email,
      productId,
    });
    return response.data;
  },

getHistory: async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.from)   params.append('from', filters.from);
  if (filters.to)     params.append('to', filters.to);
  if (filters.limit)  params.append('limit', filters.limit || 50);
  if (filters.page)   params.append('page', filters.page || 1);
  const response = await api.get(`/nova/history?${params.toString()}`);
  return response.data;
},

  resendEmail: async (transactionId, alternativeEmail = null) => {
    const response = await api.post('/nova/resend', {
      transactionId,
      alternativeEmail,
    });
    return response.data;
  },
    bulkValidate: async (items) => {
    const response = await api.post('/nova/bulk', { items });
    return response.data;
  },

  getAnalytics: async (from, to) => {
    const params = new URLSearchParams({ from, to });
    const response = await api.get(`/nova/analytics?${params.toString()}`);
    return response.data;
  },

  bulkExecute: async (items) => {
    // Timeout extendido: 100 items × ~300ms delay + tiempo de API
    const response = await api.post('/nova/bulk/execute', { items }, { timeout: 180000 });
    return response.data;
  },

  quickBuy: async (productId, customerName, email, quantity) => {
    // Timeout: 50 items × ~300ms + margen
    const response = await api.post('/nova/quick', { productId, customerName, email, quantity }, { timeout: 120000 });
    return response.data;
  },

  updateCredentials: async (clientId, clientSecret) => {
    const response = await api.put('/nova/credentials', { clientId, clientSecret });
    return response.data;
  },
};


export default novaService;