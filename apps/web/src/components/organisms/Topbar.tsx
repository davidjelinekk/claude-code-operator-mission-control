import { PanelLeft, LogOut } from 'lucide-react'
import { useUIStore } from '@/store/ui'
import { useLogout } from '@/hooks/api/auth'
import { useNavigate } from '@tanstack/react-router'
import type { CurrentUser } from '@/store/auth'

const ASCII_ART = [
  ' ██████  ██████      ██████  ██████  ███████ ██████   █████  ████████  ██████  ██████  ',
  '██      ██          ██    ██ ██   ██ ██      ██   ██ ██   ██    ██    ██    ██ ██   ██ ',
  '██      ██          ██    ██ ██████  █████   ██████  ███████    ██    ██    ██ ██████  ',
  '██      ██          ██    ██ ██      ██      ██   ██ ██   ██    ██    ██    ██ ██  ██  ',
  ' ██████  ██████      ██████  ██      ███████ ██   ██ ██   ██    ██     ██████  ██   ██ ',
]

interface TopbarProps {
  rightSlot?: React.ReactNode
  user?: CurrentUser | null
}

export function Topbar({ rightSlot, user }: TopbarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const logout = useLogout()
  const navigate = useNavigate()

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => navigate({ to: '/login' }),
      onError: () => navigate({ to: '/login' }),
    })
  }

  return (
    <header className="flex h-[72px] items-center border-b-2 border-[#21262d] bg-[#0d1117] px-4 gap-4 flex-shrink-0" style={{ boxShadow: 'inset 0 -1px 0 #58a6ff22' }}>
      <button
        onClick={toggleSidebar}
        className="text-[#6e7681] hover:text-[#8b949e] transition-colors flex-shrink-0"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-3.5 w-3.5" />
      </button>

      {/* Block ASCII art */}
      <div
        className="flex flex-col select-none"
        style={{ textShadow: '0 0 30px rgba(88,166,255,0.5), 0 0 60px rgba(88,166,255,0.2)' }}
      >
        {ASCII_ART.map((line, i) => (
          <span
            key={i}
            className="font-mono text-[#58a6ff] whitespace-pre"
            style={{ fontSize: '9px', lineHeight: '1.3' }}
          >
            {line}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {rightSlot}
        {user && (
          <>
            <span className="text-[#6e7681] text-xs font-mono">
              {user.username}
              <span className="ml-1.5 text-[#30363d]">·</span>
              <span className="ml-1.5 text-[#484f58]">{user.role}</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="text-[#6e7681] hover:text-[#f85149] transition-colors disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
