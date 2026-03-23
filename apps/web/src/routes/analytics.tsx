import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts'
import {
  useAnalyticsSummary,
  useAnalyticsTimeseries,
  useAnalyticsByAgent,
  useAnalyticsByModel,
  useAnalyticsByProject,
  useTaskVelocity,
  useTaskOutcomes,
} from '@/hooks/api/analytics'
import { useAgentNameMap } from '@/hooks/api/agents'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
})

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a5a0ff', '#39c5cf']

type Range = '7d' | '30d' | '90d'

function getRangeDates(range: Range): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  start.setDate(start.getDate() - days)
  return { start: start.toISOString(), end: end.toISOString() }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatBucket(bucket: string, range: Range): string {
  const d = new Date(bucket)
  if (range === '7d') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const tooltipStyle = {
  backgroundColor: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '0px',
  color: '#e6edf3',
  fontSize: '12px',
}

type SortKey = 'totalCostUsd' | 'inputTokens' | 'outputTokens' | 'cacheHitPct' | 'turnCount'

const OUTCOME_COLORS: Record<string, string> = {
  success: '#3fb950',
  failed: '#f85149',
  partial: '#d29922',
  abandoned: '#6e7681',
  none: '#8b949e',
}

function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d')
  const [agentSort, setAgentSort] = useState<SortKey>('totalCostUsd')
  const [agentSortDir, setAgentSortDir] = useState<'asc' | 'desc'>('desc')

  const { start, end } = useMemo(() => getRangeDates(range), [range])

  const summary = useAnalyticsSummary(start, end)
  const timeseries = useAnalyticsTimeseries(start, end)
  const byAgent = useAnalyticsByAgent(start, end)
  const byModel = useAnalyticsByModel(start, end)
  const byProject = useAnalyticsByProject(start, end)
  const taskVelocity = useTaskVelocity(start, end)
  const taskOutcomes = useTaskOutcomes(start, end)
  const agentName = useAgentNameMap()

  const agentIds = useMemo(() => {
    const ids = new Set<string>()
    timeseries.data?.forEach((d) => ids.add(d.agentId))
    return Array.from(ids)
  }, [timeseries.data])

  const chartData = useMemo(() => {
    if (!timeseries.data) return []
    const bucketMap = new Map<string, Record<string, number>>()
    timeseries.data.forEach((item) => {
      if (!bucketMap.has(item.bucket)) bucketMap.set(item.bucket, {})
      const entry = bucketMap.get(item.bucket)!
      entry[item.agentId] = (entry[item.agentId] ?? 0) + parseFloat(item.costUsd)
    })
    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({ bucket: formatBucket(bucket, range), ...values }))
  }, [timeseries.data, range])

  const modelPieData = useMemo(() => {
    return (byModel.data ?? []).map((m) => ({
      name: m.modelId.length > 20 ? m.modelId.slice(0, 20) + '…' : m.modelId,
      value: parseFloat(m.costUsd),
    }))
  }, [byModel.data])

  const sortedAgents = useMemo(() => {
    const data = (byAgent.data ?? []).map((a) => ({
      ...a,
      cacheHitPct:
        a.inputTokens + a.cacheReadTokens > 0
          ? (a.cacheReadTokens / (a.inputTokens + a.cacheReadTokens)) * 100
          : 0,
    }))
    return [...data].sort((a, b) => {
      const av = agentSort === 'totalCostUsd' ? parseFloat(a.totalCostUsd) : agentSort === 'cacheHitPct' ? a.cacheHitPct : a[agentSort as keyof typeof a] as number
      const bv = agentSort === 'totalCostUsd' ? parseFloat(b.totalCostUsd) : agentSort === 'cacheHitPct' ? b.cacheHitPct : b[agentSort as keyof typeof b] as number
      return agentSortDir === 'desc' ? bv - av : av - bv
    })
  }, [byAgent.data, agentSort, agentSortDir])

  const sortedProjects = useMemo(() => {
    return [...(byProject.data ?? [])].sort((a, b) => parseFloat(b.costUsd) - parseFloat(a.costUsd))
  }, [byProject.data])

  const velocityData = useMemo(() => {
    return (taskVelocity.data ?? []).map((d) => ({
      date: (() => {
        const dt = new Date(d.date)
        return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
      })(),
      count: d.count,
    }))
  }, [taskVelocity.data])

  const outcomesData = useMemo(() => {
    return (taskOutcomes.data ?? []).map((d) => ({
      outcome: d.outcome ?? 'none',
      count: d.count,
    }))
  }, [taskOutcomes.data])

  function toggleSort(key: SortKey) {
    if (agentSort === key) {
      setAgentSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setAgentSort(key)
      setAgentSortDir('desc')
    }
  }

  const sortIcon = (key: SortKey) => {
    if (agentSort !== key) return <span className="ml-1 text-text-tertiary">↕</span>
    return <span className="ml-1 text-accent">{agentSortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const cacheHitPct = summary.data?.cacheHitPct ?? 0

  return (
    <div className="space-y-6 p-6">
      {/* Header + Range Picker */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>analytics
        </h1>
        <div className="flex border border-border overflow-hidden">
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-sm font-mono font-medium transition-colors ${
                range === r
                  ? 'bg-accent border-r border-accent text-white'
                  : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Total Cost</p>
          <p className="text-3xl font-bold text-accent font-mono">
            ${summary.data ? parseFloat(summary.data.totalCostUsd).toFixed(4) : '—'}
          </p>
        </div>
        <div className="border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Cache Hit %</p>
          <p className={`text-3xl font-bold font-mono ${cacheHitPct > 50 ? 'text-success' : 'text-warning'}`}>
            {summary.data ? `${cacheHitPct.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Most Expensive Agent</p>
          {summary.data?.mostExpensiveAgent ? (
            <>
              <p className="text-lg font-semibold text-text-primary truncate">{summary.data.mostExpensiveAgent.name}</p>
              <p className="text-sm text-text-secondary font-mono">${parseFloat(summary.data.mostExpensiveAgent.totalCostUsd).toFixed(4)}</p>
            </>
          ) : (
            <p className="text-lg text-text-tertiary">—</p>
          )}
        </div>
        <div className="border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Total Tokens</p>
          <p className="text-3xl font-bold text-text-primary font-mono">
            {summary.data ? formatTokens(summary.data.totalInputTokens + summary.data.totalOutputTokens) : '—'}
          </p>
          {summary.data && (
            <p className="text-xs text-text-secondary font-mono mt-1">
              {formatTokens(summary.data.totalInputTokens)} in / {formatTokens(summary.data.totalOutputTokens)} out
            </p>
          )}
        </div>
      </div>

      {/* Time Series */}
      <div className="border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-4">Cost Over Time</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="bucket" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#8b949e', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name?: string | number) => [`$${(v as number).toFixed(4)}`, agentName(String(name ?? ''))]} />
            {agentIds.map((id, i) => (
              <Area
                key={id}
                type="monotone"
                dataKey={id}
                name={agentName(id)}
                stackId="1"
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Agent Table + Model Donut */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Agent Breakdown */}
        <div className="border border-border bg-surface p-5 overflow-x-auto">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-3">By Agent</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-text-secondary border-b border-border">
                <th className="text-left pb-2">Agent</th>
                <th className="text-right pb-2 cursor-pointer select-none" onClick={() => toggleSort('totalCostUsd')}>
                  Cost{sortIcon('totalCostUsd')}
                </th>
                <th className="text-right pb-2 cursor-pointer select-none" onClick={() => toggleSort('inputTokens')}>
                  In{sortIcon('inputTokens')}
                </th>
                <th className="text-right pb-2 cursor-pointer select-none" onClick={() => toggleSort('outputTokens')}>
                  Out{sortIcon('outputTokens')}
                </th>
                <th className="text-right pb-2 cursor-pointer select-none" onClick={() => toggleSort('cacheHitPct')}>
                  Cache{sortIcon('cacheHitPct')}
                </th>
                <th className="text-right pb-2 cursor-pointer select-none" onClick={() => toggleSort('turnCount')}>
                  Turns{sortIcon('turnCount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((a) => (
                <tr key={a.agentId} className="border-b border-border-subtle hover:bg-surface-hover/30">
                  <td className="py-2 text-text-primary font-mono text-xs">{agentName(a.agentId)}</td>
                  <td className="py-2 text-right font-mono text-accent">${parseFloat(a.totalCostUsd).toFixed(4)}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">{formatTokens(a.inputTokens)}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">{formatTokens(a.outputTokens)}</td>
                  <td className={`py-2 text-right font-mono ${a.cacheHitPct > 50 ? 'text-success' : 'text-warning'}`}>
                    {a.cacheHitPct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">{a.turnCount}</td>
                </tr>
              ))}
              {sortedAgents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-text-tertiary">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Model Donut */}
        <div className="border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-3">Cost by Model</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={modelPieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
              >
                {modelPieData.map((_entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${(v as number).toFixed(4)}`, 'Cost']} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#8b949e' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Project Cost Table */}
      <div className="border border-border bg-surface p-5 overflow-x-auto">
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-3">By Project</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wider text-text-secondary border-b border-border">
              <th className="text-left pb-2">Project</th>
              <th className="text-right pb-2">Total Cost</th>
              <th className="text-right pb-2">Tasks</th>
              <th className="text-right pb-2">Cost / Task</th>
            </tr>
          </thead>
          <tbody>
            {sortedProjects.map((p) => (
              <tr key={p.projectId} className="border-b border-border-subtle hover:bg-surface-hover/30">
                <td className="py-2 text-text-primary">{p.name}</td>
                <td className="py-2 text-right font-mono text-accent">${parseFloat(p.costUsd).toFixed(4)}</td>
                <td className="py-2 text-right font-mono text-text-secondary">{p.taskCount}</td>
                <td className="py-2 text-right font-mono text-text-secondary">
                  {p.taskCount > 0 ? `$${(parseFloat(p.costUsd) / p.taskCount).toFixed(4)}` : '—'}
                </td>
              </tr>
            ))}
            {sortedProjects.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-text-tertiary">No data</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Task Velocity */}
      <div className="border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-4">Task Velocity (Completed/Day)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={velocityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#8b949e', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v as number, 'Tasks']} />
            <Bar dataKey="count" fill="#3fb950" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Task Outcomes */}
      <div className="border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-4">Task Outcomes</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={outcomesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="outcome" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#8b949e', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v as number, 'Tasks']} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {outcomesData.map((entry, i) => (
                <Cell key={i} fill={OUTCOME_COLORS[entry.outcome] ?? '#8b949e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
