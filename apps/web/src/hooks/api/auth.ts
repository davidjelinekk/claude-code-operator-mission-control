import { useMutation, useQuery } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { CurrentUser } from '@/store/auth'

interface LoginResponse extends CurrentUser {
  sessionToken: string
}

export function useMe() {
  return useQuery<CurrentUser>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get('api/auth/me').json<CurrentUser>(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  const setToken = useAuthStore((s) => s.setToken)
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser)

  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      api.post('api/auth/login', { json: data }).json<LoginResponse>(),
    onSuccess: (data) => {
      setToken(data.sessionToken)
      setCurrentUser({ id: data.id, username: data.username, role: data.role })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear)

  return useMutation({
    mutationFn: () => api.post('api/auth/logout').json<{ ok: boolean }>(),
    onSuccess: () => {
      clear()
      queryClient.clear()
    },
    onError: () => {
      // Clear local state even if server request fails
      clear()
      queryClient.clear()
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('api/auth/change-password', { json: data }).json<{ ok: boolean }>(),
  })
}
