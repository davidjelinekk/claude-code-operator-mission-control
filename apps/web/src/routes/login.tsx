import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLogin } from '@/hooks/api/auth'
import { useAuthStore } from '@/store/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const login = useLogin()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (token) {
      navigate({ to: '/' })
    }
  }, [token, navigate])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    login.mutate(
      { username, password },
      { onSuccess: () => navigate({ to: '/' }) },
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="flex items-baseline justify-center gap-2 mb-3">
            <span className="font-mono text-2xl font-bold text-accent tracking-tight">claude code</span>
            <span className="font-mono text-2xl font-semibold text-text-primary tracking-tight">operator</span>
          </div>
          <p className="text-text-tertiary text-sm font-mono">operator access</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-text-secondary text-xs font-mono uppercase tracking-wider">
              username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="bg-canvas border border-border rounded px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-secondary text-xs font-mono uppercase tracking-wider">
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-canvas border border-border rounded px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>

          {login.isError && (
            <p className="text-error text-xs font-mono">
              Invalid username or password
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending || !username || !password}
            className="mt-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-mono py-2.5 px-4 rounded transition-colors"
          >
            {login.isPending ? 'signing in...' : 'sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
