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
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex flex-col items-center gap-1 mb-2">
            {[
              ' ██████  ██████      ██████  ██████  ███████ ██████   █████  ████████  ██████  ██████  ',
              '██      ██          ██    ██ ██   ██ ██      ██   ██ ██   ██    ██    ██    ██ ██   ██ ',
              '██      ██          ██    ██ ██████  █████   ██████  ███████    ██    ██    ██ ██████  ',
              '██      ██          ██    ██ ██      ██      ██   ██ ██   ██    ██    ██    ██ ██  ██  ',
              ' ██████  ██████      ██████  ██      ███████ ██   ██ ██   ██    ██     ██████  ██   ██ ',
            ].map((line, i) => (
              <span
                key={i}
                className="font-mono text-[#58a6ff] whitespace-pre select-none"
                style={{
                  fontSize: '6px',
                  lineHeight: '1.3',
                  textShadow: '0 0 20px rgba(88,166,255,0.4)',
                }}
              >
                {line}
              </span>
            ))}
          </div>
          <p className="text-[#6e7681] text-sm font-mono mt-3">operator access</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-[#8b949e] text-xs font-mono uppercase tracking-wider">
              username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[#e6edf3] text-sm font-mono focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[#8b949e] text-xs font-mono uppercase tracking-wider">
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[#e6edf3] text-sm font-mono focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-colors"
            />
          </div>

          {login.isError && (
            <p className="text-[#f85149] text-xs font-mono">
              Invalid username or password
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending || !username || !password}
            className="mt-1 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-mono py-2 px-4 rounded transition-colors"
          >
            {login.isPending ? 'signing in...' : 'sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
