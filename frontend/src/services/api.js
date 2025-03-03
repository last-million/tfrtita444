// frontend/src/services/api.js
import axios from 'axios';

// Create an Axios instance with the base URL from environment variables.
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// Add a request interceptor to attach the token (if any).
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add a response interceptor for handling authentication errors.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Export an object containing your API endpoints that use the Axios instance.
export const api = {
  // Auth endpoints
  auth: {
    login: (credentials) => axiosInstance.post('/api/auth/token', credentials),
    verifyToken: () => axiosInstance.get('/api/auth/verify'),
    logout: () => localStorage.removeItem('token')
  },

  // Call endpoints
  calls: {
    initiate: (phoneNumber, ultravoxUrl) =>
      axiosInstance.post('/api/calls/initiate', null, { params: { to_number: phoneNumber, ultravox_url: ultravoxUrl } }),
    bulkCall: (numbers) => axiosInstance.post('/api/calls/bulk', { phone_numbers: numbers }),
    getHistory: (filters) => axiosInstance.get('/api/calls/history', { params: filters }),
    getCallDetails: (callId) => axiosInstance.get(`/api/calls/${callId}`)
  },

  // Clients endpoints
  clients: {
    list: () => axiosInstance.get('/api/clients'),
    create: (client) => axiosInstance.post('/api/clients', client),
    update: (clientId, data) => axiosInstance.put(`/api/clients/${clientId}`, data),
    delete: (clientId) => axiosInstance.delete(`/api/clients/${clientId}`),
    import: (data) => axiosInstance.post('/api/clients/import', data)
  },

  // Service connections
  services: {
    connect: (serviceName, credentials) =>
      axiosInstance.post('/api/credentials/validate', { service: serviceName, credentials }),
    getStatus: (serviceName) =>
      axiosInstance.get(`/api/credentials/status/${serviceName}`),
    updateCredentials: (serviceName, credentials) =>
      axiosInstance.put(`/api/credentials/${serviceName}`, credentials)
  },

  // Drive operations
  drive: {
    connect: () => axiosInstance.get('/api/drive/connect'),
    getStatus: () => axiosInstance.get('/api/drive/status'),
    listFiles: () => axiosInstance.get('/api/drive/files')
  },

  // Files and uploads
  files: {
    upload: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return axiosInstance.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
  },

  // Knowledge base operations
  knowledgeBase: {
    vectorize: (files, table) =>
      axiosInstance.post('/api/vectorize', { files, table }),
    search: (query) =>
      axiosInstance.post('/api/knowledge/search', { query })
  },

  // Supabase operations
  supabase: {
    listTables: () => axiosInstance.get('/api/supabase/tables'),
    getTableData: (tableName) =>
      axiosInstance.get(`/api/supabase/tables/${tableName}`)
  }
};
