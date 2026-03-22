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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
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
  workspace: '#58a6ff',
  agents:    '#d29922',
  observe:   '#a371f7',
  system:    '#6e7681',
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

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { data: pendingApprovals } = useAllPendingApprovals()
  const pendingCount = pendingApprovals?.length ?? 0

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#0d1117] border-r border-[#21262d] h-screen transition-all duration-200 overflow-hidden flex-shrink-0',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Header — matches topbar h-[72px] */}
      <Link
        to="/"
        className={cn(
          'h-[72px] border-b border-[#21262d] flex-shrink-0 select-none hover:bg-[#161b22] transition-colors',
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
          style={{ filter: 'drop-shadow(0 0 4px #58a6ff33)' }}
        >
          {/* Bold chevron > */}
          <path d="M16 22 L54 50 L16 78" stroke="#58a6ff" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit="10" />
          {/* Dispatch fork */}
          <line x1="64" y1="44" x2="78" y2="28" stroke="#58a6ff" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          <line x1="64" y1="56" x2="78" y2="72" stroke="#58a6ff" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          {/* Operator node */}
          <circle cx="60" cy="50" r="11" fill="#58a6ff" />
          <circle cx="60" cy="50" r="5" fill="#0d1117" />
          {/* Signal dots */}
          <circle cx="82" cy="24" r="4" fill="#58a6ff" opacity="0.45" />
          <circle cx="84" cy="38" r="3" fill="#58a6ff" opacity="0.55" />
          <circle cx="84" cy="62" r="3" fill="#58a6ff" opacity="0.45" />
          <circle cx="82" cy="76" r="4" fill="#58a6ff" opacity="0.35" />
        </svg>

        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="font-mono font-bold text-[13px] tracking-[0.2em] text-[#e6edf3]">
              CC<span className="text-[#58a6ff]">_</span>
            </span>
            <span className="font-mono text-[9px] tracking-[0.3em] text-[#6e7681] uppercase mt-0.5">
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
                        active ? 'text-[#58a6ff]' : 'text-[#6e7681] hover:text-[#8b949e]',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label === 'approvals' && pendingCount > 0 && (
                        <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-[#f85149]" />
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
                    style={{ backgroundColor: GROUP_COLORS[group] ?? '#6e7681' }}
                  />
                  <span
                    className="font-mono text-[10px] tracking-[0.12em] uppercase select-none"
                    style={{ color: GROUP_COLORS[group] ?? '#6e7681' }}
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
                              ? 'border-[#58a6ff] bg-[#161b22] text-[#e6edf3]'
                              : 'border-transparent text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]',
                          )}
                        >
                          <Icon className={cn(
                            'h-3 w-3 flex-shrink-0',
                            active ? 'text-[#58a6ff]' : '',
                          )} />
                          <span>{label}</span>
                          {label === 'approvals' && pendingCount > 0 && (
                            <span className="ml-auto font-mono text-[9px] bg-[#f85149] text-white rounded-full px-1 min-w-[14px] text-center">
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
    </aside>
  )
}
