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
      <div className="flex items-start justify-between border-b border-border-subtle pb-4">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>settings
        </h1>
      </div>

      {/* Account */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <User className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">account</span>
        </div>
        <div className="border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-tertiary w-20">username</span>
            <span className="font-mono text-[12px] text-text-primary">{me?.username ?? '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-tertiary w-20">role</span>
            <span className={`font-mono text-[11px] px-1.5 py-0.5 border ${
              me?.role === 'admin'
                ? 'text-warning border-warning bg-warning/10'
                : 'text-text-secondary border-border'
            }`}>
              {me?.role ?? '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-tertiary w-20">session</span>
            <span className="font-mono text-[11px] text-text-tertiary">{maskedToken}</span>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">change password</span>
        </div>
        <div className="border border-border bg-surface p-4">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] text-text-tertiary uppercase tracking-widest mb-1">
                current password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-1.5 font-mono text-[12px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                placeholder="current password"
                required
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-text-tertiary uppercase tracking-widest mb-1">
                new password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-1.5 font-mono text-[12px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                placeholder="min 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-text-tertiary uppercase tracking-widest mb-1">
                confirm new password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-1.5 font-mono text-[12px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                placeholder="repeat new password"
                required
              />
            </div>

            {pwMsg && (
              <div className={`flex items-center gap-1.5 font-mono text-[11px] ${
                pwMsg.type === 'ok' ? 'text-success' : 'text-error'
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
                className="px-4 py-1.5 font-mono text-[12px] text-canvas bg-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
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
          <Wifi className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">gateway connection</span>
        </div>
        <div className="border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-tertiary w-16">url</span>
            <code className="font-mono text-[11px] text-text-primary">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:3001'} → gateway
            </code>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-tertiary w-16">status</span>
            <div className="flex items-center gap-2">
              {gwStatus === 'ok' && (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  <span className="font-mono text-[11px] text-success">connected</span>
                </>
              )}
              {gwStatus === 'error' && (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-error" />
                  <span className="font-mono text-[11px] text-error">unreachable</span>
                </>
              )}
              {gwStatus === 'idle' && (
                <span className="font-mono text-[11px] text-text-tertiary">not tested</span>
              )}
              {gwStatus === 'testing' && (
                <span className="font-mono text-[11px] text-text-secondary animate-pulse">testing…</span>
              )}
            </div>
          </div>

          {gwStatus === 'error' && gwError && (
            <p className="font-mono text-[10px] text-error break-all">{gwError}</p>
          )}

          <button
            onClick={testGateway}
            disabled={gwStatus === 'testing'}
            className="px-3 py-1.5 font-mono text-[12px] text-text-secondary border border-border hover:border-accent hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {gwStatus === 'testing' ? 'testing…' : 'test gateway'}
          </button>
        </div>
      </section>

      {/* System Health */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">system health</span>
        </div>
        <div className="border border-border bg-surface p-4 space-y-2">
          {(['db', 'redis', 'gateway'] as const).map((svc) => {
            const s = systemStatus?.[svc]
            const ok = s?.ok
            const latency = svc !== 'gateway' && s && 'latencyMs' in s ? s.latencyMs : undefined
            return (
              <div key={svc} className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-text-tertiary w-16">{svc}</span>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  s == null ? 'bg-text-tertiary' : ok ? 'bg-success' : 'bg-error'
                }`} />
                <span className={`font-mono text-[11px] ${
                  s == null ? 'text-text-tertiary' : ok ? 'text-success' : 'text-error'
                }`}>
                  {s == null ? 'loading…' : ok ? 'ok' : 'error'}
                </span>
                {latency != null && (
                  <span className="font-mono text-[10px] text-text-tertiary border border-border px-1.5 py-0.5">
                    {latency}ms
                  </span>
                )}
              </div>
            )
          })}
          <div className="flex items-center gap-3 pt-1 border-t border-border-subtle mt-2">
            <span className="font-mono text-[11px] text-text-tertiary w-16">flow</span>
            {(() => {
              const w = systemStatus?.workers?.['flowTail']
              if (!w) return <span className="font-mono text-[11px] text-text-tertiary">never</span>
              const ago = w.lastRunAt ? Math.round((Date.now() - new Date(w.lastRunAt).getTime()) / 1000) : null
              const label = ago == null ? 'never' : ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`
              return (
                <>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${w.ok ? 'bg-success' : 'bg-error'}`} />
                  <span className="font-mono text-[11px] text-text-secondary">{label}</span>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Operator Token */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">operator token</span>
        </div>
        <div className="border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <code className="font-mono text-[12px] text-text-primary flex-1 break-all">
              {showFullToken
                ? (systemStatus?.env.operatorTokenFull ?? '—')
                : (systemStatus?.env.operatorTokenPrefix ?? '…')}
            </code>
            <button
              onClick={() => setShowFullToken((v) => !v)}
              className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
              title={showFullToken ? 'Hide token' : 'Show full token'}
            >
              {showFullToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={copyToken}
              className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
              title="Copy token"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied && <span className="font-mono text-[10px] text-success">copied!</span>}
          </div>
          <p className="font-mono text-[10px] text-text-tertiary">
            Agents authenticate using <code className="text-purple-400">Authorization: Bearer &lt;token&gt;</code>
          </p>
        </div>
      </section>

      {/* API Token Info */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">api access (for agents)</span>
        </div>
        <div className="border border-border bg-surface p-4 space-y-2">
          <p className="font-mono text-[11px] text-text-tertiary">
            Agents and automation should use the <code className="text-text-primary">OPERATOR_TOKEN</code> from the API server environment.
            This bypasses session auth and grants admin access.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest w-16">header</span>
            <code className="font-mono text-[11px] text-purple-400">Authorization: Bearer &lt;OPERATOR_TOKEN&gt;</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest w-16">api url</span>
            <code className="font-mono text-[11px] text-text-primary">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}
            </code>
          </div>
        </div>
      </section>
    </div>
  )
}
