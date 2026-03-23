import { PanelLeft, LogOut } from 'lucide-react'
import { useUIStore } from '@/store/ui'
import { useLogout } from '@/hooks/api/auth'
import { useNavigate } from '@tanstack/react-router'
import type { CurrentUser } from '@/store/auth'

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
    <header className="flex h-14 items-center border-b border-border bg-canvas px-4 gap-4 flex-shrink-0">
      <button
        onClick={toggleSidebar}
        className="text-text-tertiary hover:text-text-secondary transition-colors flex-shrink-0"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      {/* Brand */}
      <div className="flex items-baseline gap-1.5 select-none">
        <span className="font-mono text-sm font-semibold text-accent tracking-tight">claude code</span>
        <span className="font-mono text-sm font-medium text-text-primary tracking-tight">operator</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {rightSlot}
        {user && (
          <>
            <span className="text-text-tertiary text-xs font-mono">
              {user.username}
              <span className="mx-1.5 text-border-strong">·</span>
              <span className="text-text-tertiary">{user.role}</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="text-text-tertiary hover:text-error transition-colors disabled:opacity-50"
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
