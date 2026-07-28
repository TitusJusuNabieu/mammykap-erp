import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  plan: string;
  orgId: string;
  orgName: string;
  branchId: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      get isAuthenticated() {
        return get().user !== null && get().accessToken !== null;
      },
      setAuth: (user, accessToken) => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('access_token', accessToken);
          // Set a session cookie so the Next.js middleware can gate protected routes.
          // httpOnly is NOT set here (client-side write) — it is intentionally readable.
          document.cookie = 'session=1; path=/; SameSite=Lax; max-age=' + (7 * 24 * 60 * 60);
        }
        set({ user, accessToken });
      },
      clearAuth: () => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('access_token');
          document.cookie = 'session=; path=/; max-age=0';
        }
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: 'ledgera-auth',
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
