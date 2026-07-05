import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Helper: parse JWT claims without a library
function parseJwt(token: string): { exp?: number } | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const claims = parseJwt(token);
  if (!claims?.exp) return true;
  // Treat as expired 30s early to avoid races
  return Date.now() / 1000 > claims.exp - 30;
}

async function proactiveRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  } catch {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    return null;
  }
}

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// Request interceptor: proactively refresh expired tokens before they hit the server
api.interceptors.request.use(async (config) => {
  if (typeof window === 'undefined') return config;

  let token = localStorage.getItem('accessToken');

  if (token && isTokenExpired(token)) {
    token = await proactiveRefresh();
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor: reactive fallback if server still returns 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const newToken = await proactiveRefresh();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);
