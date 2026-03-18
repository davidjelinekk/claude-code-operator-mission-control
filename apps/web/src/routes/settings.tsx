import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Key, CheckCircle, AlertCircle, User, Lock, Wifi, WifiOff, Activity, Eye, EyeOff, Copy } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useMe, useChangePassword } from '@/hooks/api/auth'
import { useSystemStatus } from '@/hooks/api/system'
import { api } from '@/lib/api'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { token } = useAuthStore()
  const { data: me } = useMe()
  const changePassword = useChangePassword()
  const { data: systemStatus } = useSystemStatus()

  // Operator token visibility
  const [showFullToken, setShowFullToken] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyToken() {
    if (!systemStatus?.env.operatorTokenFull) return
    navigator.clipboard.writeText(systemStatus.env.operatorTokenFull).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Gateway connection test
  const [gwStatus, setGwStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [gwError, setGwError] = useState('')

  // Change password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  async function testGateway() {
    setGwStatus('testing')
    setGwError('')
    try {
      await api.get('api/gateway/status')
      setGwStatus('ok')
    } catch (err) {
      setGwStatus('error')
      setGwError(String(err))
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' })
      return
    }
    if (newPw.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters' })
      return
    }
    changePassword.mutate(
      { currentPassword: currentPw, newPassword: newPw },
      {
        onSuccess: () => {
          setPwMsg({ type: 'ok', text: 'Password updated successfully' })
          setCurrentPw('')
          setNewPw('')
          setConfirmPw('')
        },
        onError: (err) => {
          const msg = (err as { message?: string }).message ?? 'Failed to update password'
          setPwMsg({ type: 'error', text: msg.includes('400') ? 'Current password is incorrect' : msg })
        },
      },
    )
  }

  const maskedToken = token ? token.slice(0, 8) + '…' + token.slice(-4) : '(none)'

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between border-b border-[#21262d] pb-4">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>settings
        </h1>
      </div>

      {/* Account */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <User className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">account</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[#6e7681] w-20">username</span>
            <span className="font-mono text-[12px] text-[#e6edf3]">{me?.username ?? '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[#6e7681] w-20">role</span>
            <span className={`font-mono text-[11px] px-1.5 py-0.5 border ${
              me?.role === 'admin'
                ? 'text-[#d29922] border-[#9e6a03] bg-[#9e6a03]/10'
                : 'text-[#8b949e] border-[#30363d]'
            }`}>
              {me?.role ?? '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[#6e7681] w-20">session</span>
            <span className="font-mono text-[11px] text-[#6e7681]">{maskedToken}</span>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">change password</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] text-[#6e7681] uppercase tracking-widest mb-1">
                current password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-1.5 font-mono text-[12px] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
                placeholder="current password"
                required
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#6e7681] uppercase tracking-widest mb-1">
                new password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-1.5 font-mono text-[12px] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
                placeholder="min 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#6e7681] uppercase tracking-widest mb-1">
                confirm new password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-1.5 font-mono text-[12px] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
                placeholder="repeat new password"
                required
              />
            </div>

            {pwMsg && (
              <div className={`flex items-center gap-1.5 font-mono text-[11px] ${
                pwMsg.type === 'ok' ? 'text-[#3fb950]' : 'text-[#f85149]'
              }`}>
                {pwMsg.type === 'ok'
                  ? <CheckCircle className="h-3 w-3" />
                  : <AlertCircle className="h-3 w-3" />}
                {pwMsg.text}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={changePassword.isPending}
                className="px-4 py-1.5 font-mono text-[12px] text-[#0d1117] bg-[#58a6ff] hover:bg-[#79b8ff] transition-colors disabled:opacity-50"
              >
                {changePassword.isPending ? 'updating…' : 'update password'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Gateway Connection */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">gateway connection</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[#6e7681] w-16">url</span>
            <code className="font-mono text-[11px] text-[#e6edf3]">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:3001'} → gateway
            </code>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[#6e7681] w-16">status</span>
            <div className="flex items-center gap-2">
              {gwStatus === 'ok' && (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-[#3fb950]" />
                  <span className="font-mono text-[11px] text-[#3fb950]">connected</span>
                </>
              )}
              {gwStatus === 'error' && (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-[#f85149]" />
                  <span className="font-mono text-[11px] text-[#f85149]">unreachable</span>
                </>
              )}
              {gwStatus === 'idle' && (
                <span className="font-mono text-[11px] text-[#6e7681]">not tested</span>
              )}
              {gwStatus === 'testing' && (
                <span className="font-mono text-[11px] text-[#8b949e] animate-pulse">testing…</span>
              )}
            </div>
          </div>

          {gwStatus === 'error' && gwError && (
            <p className="font-mono text-[10px] text-[#f85149] break-all">{gwError}</p>
          )}

          <button
            onClick={testGateway}
            disabled={gwStatus === 'testing'}
            className="px-3 py-1.5 font-mono text-[12px] text-[#8b949e] border border-[#30363d] hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors disabled:opacity-40"
          >
            {gwStatus === 'testing' ? 'testing…' : 'test gateway'}
          </button>
        </div>
      </section>

      {/* System Health */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">system health</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-2">
          {(['db', 'redis', 'gateway'] as const).map((svc) => {
            const s = systemStatus?.[svc]
            const ok = s?.ok
            const latency = svc !== 'gateway' && s && 'latencyMs' in s ? s.latencyMs : undefined
            return (
              <div key={svc} className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-[#6e7681] w-16">{svc}</span>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  s == null ? 'bg-[#484f58]' : ok ? 'bg-[#3fb950]' : 'bg-[#f85149]'
                }`} />
                <span className={`font-mono text-[11px] ${
                  s == null ? 'text-[#6e7681]' : ok ? 'text-[#3fb950]' : 'text-[#f85149]'
                }`}>
                  {s == null ? 'loading…' : ok ? 'ok' : 'error'}
                </span>
                {latency != null && (
                  <span className="font-mono text-[10px] text-[#6e7681] border border-[#30363d] px-1.5 py-0.5">
                    {latency}ms
                  </span>
                )}
              </div>
            )
          })}
          <div className="flex items-center gap-3 pt-1 border-t border-[#21262d] mt-2">
            <span className="font-mono text-[11px] text-[#6e7681] w-16">flow</span>
            {(() => {
              const w = systemStatus?.workers?.['flowTail']
              if (!w) return <span className="font-mono text-[11px] text-[#6e7681]">never</span>
              const ago = w.lastRunAt ? Math.round((Date.now() - new Date(w.lastRunAt).getTime()) / 1000) : null
              const label = ago == null ? 'never' : ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`
              return (
                <>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${w.ok ? 'bg-[#3fb950]' : 'bg-[#f85149]'}`} />
                  <span className="font-mono text-[11px] text-[#8b949e]">{label}</span>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Operator Token */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">operator token</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <code className="font-mono text-[12px] text-[#e6edf3] flex-1 break-all">
              {showFullToken
                ? (systemStatus?.env.operatorTokenFull ?? '—')
                : (systemStatus?.env.operatorTokenPrefix ?? '…')}
            </code>
            <button
              onClick={() => setShowFullToken((v) => !v)}
              className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] transition-colors flex-shrink-0"
              title={showFullToken ? 'Hide token' : 'Show full token'}
            >
              {showFullToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={copyToken}
              className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] transition-colors flex-shrink-0"
              title="Copy token"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied && <span className="font-mono text-[10px] text-[#3fb950]">copied!</span>}
          </div>
          <p className="font-mono text-[10px] text-[#6e7681]">
            Agents authenticate using <code className="text-[#a5a0ff]">Authorization: Bearer &lt;token&gt;</code>
          </p>
        </div>
      </section>

      {/* API Token Info */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-3.5 w-3.5 text-[#58a6ff]" />
          <span className="font-mono text-xs text-[#8b949e] uppercase tracking-widest">api access (for agents)</span>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-2">
          <p className="font-mono text-[11px] text-[#6e7681]">
            Agents and automation should use the <code className="text-[#e6edf3]">OPERATOR_TOKEN</code> from the API server environment.
            This bypasses session auth and grants admin access.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest w-16">header</span>
            <code className="font-mono text-[11px] text-[#a5a0ff]">Authorization: Bearer &lt;OPERATOR_TOKEN&gt;</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest w-16">api url</span>
            <code className="font-mono text-[11px] text-[#e6edf3]">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}
            </code>
          </div>
        </div>
      </section>
    </div>
  )
}
