import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrentUser {
  id: string
  username: string
  role: string
}

interface AuthState {
  token: string | null
  currentUser: CurrentUser | null
  setToken: (token: string | null) => void
  setCurrentUser: (user: CurrentUser | null) => void
  clear: () => void
}

const ENV_TOKEN = import.meta.env.VITE_OPERATOR_TOKEN ?? null

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: ENV_TOKEN,
      currentUser: null,
      setToken: (token) => set({ token }),
      setCurrentUser: (currentUser) => set({ currentUser }),
      clear: () => set({ token: null, currentUser: null }),
    }),
    {
      name: 'cc-auth',
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<AuthState> | null
        return {
          ...current,
          token: p?.token ?? ENV_TOKEN,
          currentUser: p?.currentUser ?? null,
        }
      },
    },
  ),
)
