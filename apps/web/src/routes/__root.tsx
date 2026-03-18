import { createRootRoute, Outlet, redirect, useRouterState, useNavigate } from '@tanstack/react-router'
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Sidebar } from '@/components/organisms/Sidebar'
import { Topbar } from '@/components/organisms/Topbar'
import { useMe } from '@/hooks/api/auth'
import { useAuthStore } from '@/store/auth'
import { ToastContainer } from '@/components/organisms/ToastContainer'

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/login') return
    const token = useAuthStore.getState().token
    if (!token) {
      throw redirect({ to: '/login' })
    }
  },
  component: RootLayout,
})

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-gray-200">
          <div className="text-center max-w-md p-6">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4 text-sm">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RootLayout() {
  const { location } = useRouterState()
  if (location.pathname === '/login') {
    return <Outlet />
  }
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  )
}

// Separate component so hooks are always called unconditionally
function MainLayout() {
  const navigate = useNavigate()
  const { data: me, isError, isLoading } = useMe()

  // Redirect to login if session expired / token became invalid
  useEffect(() => {
    if (!isLoading && isError) {
      useAuthStore.getState().clear()
      navigate({ to: '/login' })
    }
  }, [isLoading, isError, navigate])

  if (isLoading || isError || !me) {
    return <div className="min-h-screen bg-[#0d1117]" />
  }

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar user={me} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
