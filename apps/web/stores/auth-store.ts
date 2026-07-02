import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  role: string | null;

  hydrate: () => void;
  setAuth: (data: { accessToken: string; refreshToken: string; email: string; role: string }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  email: null,
  role: null,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    const email = localStorage.getItem('userEmail');
    const role = localStorage.getItem('userRole');
    set({ accessToken, refreshToken, email, role });
  },

  setAuth: (data) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('userEmail', data.email);
      localStorage.setItem('userRole', data.role);
    }
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.email,
      role: data.role,
    });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userRole');
      // Clear the indicator cookie read by the Edge middleware
      document.cookie = 'qg_logged_in=; path=/; max-age=0; SameSite=Lax';
    }
    set({ accessToken: null, refreshToken: null, email: null, role: null });
  },
}));
