import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || 'https://vortex-code.sidreddypleaseworktesting.workers.dev';

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for auth
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle auth error
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default api;
