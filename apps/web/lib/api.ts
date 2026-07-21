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
  // Treat as expired 60s early to avoid races (bumped from 30s)
  return Date.now() / 1000 > claims.exp - 60;
}

/**
 * Clears all auth state and the middleware-readable cookie, then
 * redirects to /login.  Called whenever refresh fails or tokens are gone.
 */
function clearAuthAndRedirect(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userRole');
  // Clear the indicator cookie so the Edge middleware stops letting the user through
  document.cookie = 'qg_logged_in=; path=/; max-age=0; SameSite=Lax';
  window.location.href = '/login';
}

/**
 * Singleton in-flight refresh promise.
 * All concurrent requests that hit an expired token share this one promise
 * so we never send multiple /auth/refresh calls at once (which would hit
 * the rate-limit of 10 per 15 min and cause cascading 401s).
 */
let refreshPromise: Promise<string | null> | null = null;

async function proactiveRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // If a refresh is already in flight, piggyback on it
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    clearAuthAndRedirect();
    return null;
  }

  // Don't attempt refresh if the refresh token itself is expired
  if (isTokenExpired(refreshToken)) {
    clearAuthAndRedirect();
    return null;
  }

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return data.accessToken as string;
    } catch {
      clearAuthAndRedirect();
      return null;
    } finally {
      // Reset so future calls can issue a new refresh
      refreshPromise = null;
    }
  })();

  return refreshPromise;
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
      // proactiveRefresh already called clearAuthAndRedirect()
    }
    return Promise.reject(error);
  }
);
