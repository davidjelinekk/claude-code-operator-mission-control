import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  FolderKanban,
  Bot,
  GitBranch,
  BarChart2,
  Wrench,
  Clock,
  Settings,
  Users,
  Activity,
  Tag,
  Inbox,
  SlidersHorizontal,
  Package,
  FolderOpen,
  CheckSquare,
  Server,
  Terminal,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { useThemeStore } from '@/store/theme'
import { useAllPendingApprovals } from '@/hooks/api/approvals'

type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = {
  group: string
  short: string   // collapsed label
  items: NavItem[]
}

const GROUP_COLORS: Record<string, string> = {
  workspace: 'hsl(var(--color-accent))',
  agents:    'hsl(var(--color-warning))',
  observe:   '#a371f7',
  system:    'hsl(var(--color-text-tertiary))',
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'workspace',
    short: 'ws',
    items: [
      { label: 'boards',    to: '/boards',       icon: LayoutDashboard },
      { label: 'activity',  to: '/activity',    icon: Activity },
      { label: 'people',    to: '/people',       icon: Users },
      { label: 'projects',  to: '/projects',     icon: FolderKanban },
    ],
  },
  {
    group: 'agents',
    short: 'ag',
    items: [
      { label: 'agents',    to: '/agents',    icon: Bot },
      { label: 'workload',  to: '/workload',  icon: Inbox },
      { label: 'flow',      to: '/flow',      icon: GitBranch },
      { label: 'orchestration', to: '/orchestration', icon: Server },
      { label: 'skills',    to: '/skills',    icon: Wrench },
      { label: 'scripts',   to: '/scripts',   icon: Terminal },
    ],
  },
  {
    group: 'observe',
    short: 'ob',
    items: [
      { label: 'analytics', to: '/analytics', icon: BarChart2 },
      { label: 'cron',      to: '/cron',      icon: Clock },
      { label: 'approvals', to: '/approvals', icon: CheckSquare },
    ],
  },
  {
    group: 'system',
    short: 'sy',
    items: [
      { label: 'tags',          to: '/tags',           icon: Tag },
      { label: 'custom fields', to: '/custom-fields',  icon: SlidersHorizontal },
      { label: 'skill packs',   to: '/skill-packs',    icon: Package },
      { label: 'board groups',  to: '/board-groups',   icon: FolderOpen },
      { label: 'settings',      to: '/settings',       icon: Settings },
    ],
  },
]

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme, resolvedTheme } = useThemeStore()
  const isDark = resolvedTheme() === 'dark'

  function toggle() {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <div className="border-t border-border-subtle p-2 flex-shrink-0">
      <button
        onClick={toggle}
        className={cn(
          'flex items-center gap-2 w-full rounded px-2 py-1.5 text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors',
          collapsed && 'justify-center',
        )}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-3.5 w-3.5 flex-shrink-0" /> : <Moon className="h-3.5 w-3.5 flex-shrink-0" />}
        {!collapsed && (
          <span className="font-mono text-[11px]">{isDark ? 'Light mode' : 'Dark mode'}</span>
        )}
      </button>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { data: pendingApprovals } = useAllPendingApprovals()
  const pendingCount = pendingApprovals?.length ?? 0

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar border-r border-border-subtle h-screen transition-all duration-200 overflow-hidden flex-shrink-0',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Header — matches topbar h-14 */}
      <Link
        to="/"
        className={cn(
          'h-14 border-b border-border-subtle flex-shrink-0 select-none hover:bg-surface transition-colors',
          collapsed ? 'flex items-center justify-center' : 'flex items-center gap-2.5 px-3',
        )}
      >
        {/* Logo mark — chevron dispatch */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 100 100"
          fill="none"
          className="flex-shrink-0"
          style={{ filter: 'drop-shadow(0 0 4px hsl(var(--color-accent) / 0.2))' }}
        >
          {/* Bold chevron > */}
          <path d="M16 22 L54 50 L16 78" stroke="hsl(var(--color-accent))" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit="10" />
          {/* Dispatch fork */}
          <line x1="64" y1="44" x2="78" y2="28" stroke="hsl(var(--color-accent))" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          <line x1="64" y1="56" x2="78" y2="72" stroke="hsl(var(--color-accent))" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          {/* Operator node */}
          <circle cx="60" cy="50" r="11" fill="hsl(var(--color-accent))" />
          <circle cx="60" cy="50" r="5" fill="hsl(var(--color-canvas))" />
          {/* Signal dots */}
          <circle cx="82" cy="24" r="4" fill="hsl(var(--color-accent))" opacity="0.45" />
          <circle cx="84" cy="38" r="3" fill="hsl(var(--color-accent))" opacity="0.55" />
          <circle cx="84" cy="62" r="3" fill="hsl(var(--color-accent))" opacity="0.45" />
          <circle cx="82" cy="76" r="4" fill="hsl(var(--color-accent))" opacity="0.35" />
        </svg>

        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="font-mono font-bold text-[13px] tracking-[0.2em] text-text-primary">
              CC<span className="text-accent">_</span>
            </span>
            <span className="font-mono text-[9px] tracking-[0.3em] text-text-tertiary uppercase mt-0.5">
              operator
            </span>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {collapsed ? (
          // Collapsed: icons only, centered
          <ul className="flex flex-col">
            {NAV_GROUPS.flatMap(({ items }) =>
              items.map(({ to, label, icon: Icon }) => {
                const active = pathname === to || pathname.startsWith(to + '/')
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      title={label}
                      className={cn(
                        'relative flex items-center justify-center py-2 transition-colors',
                        active ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label === 'approvals' && pendingCount > 0 && (
                        <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-error" />
                      )}
                    </Link>
                  </li>
                )
              })
            )}
          </ul>
        ) : (
          // Expanded: grouped nav with left border active state
          <ul className="flex flex-col">
            {NAV_GROUPS.map(({ group, items }) => (
              <li key={group}>
                {/* Group label */}
                <div className="px-3 py-1 mt-3 flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: GROUP_COLORS[group] ?? 'hsl(var(--color-text-tertiary))' }}
                  />
                  <span
                    className="font-mono text-[10px] tracking-[0.12em] uppercase select-none"
                    style={{ color: GROUP_COLORS[group] ?? 'hsl(var(--color-text-tertiary))' }}
                  >
                    {group}
                  </span>
                </div>
                {/* Nav items */}
                <ul>
                  {items.map(({ label, to, icon: Icon }) => {
                    const active = pathname === to || pathname.startsWith(to + '/')
                    return (
                      <li key={to}>
                        <Link
                          to={to}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-[6px] font-mono text-[12px] transition-colors border-l-[3px]',
                            active
                              ? 'border-accent bg-surface text-text-primary'
                              : 'border-transparent text-text-secondary hover:bg-surface hover:text-text-primary',
                          )}
                        >
                          <Icon className={cn(
                            'h-3 w-3 flex-shrink-0',
                            active ? 'text-accent' : '',
                          )} />
                          <span>{label}</span>
                          {label === 'approvals' && pendingCount > 0 && (
                            <span className="ml-auto font-mono text-[9px] bg-error text-white rounded-full px-1 min-w-[14px] text-center">
                              {pendingCount > 99 ? '99+' : pendingCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Theme toggle */}
      <ThemeToggle collapsed={collapsed} />
    </aside>
  )
}
