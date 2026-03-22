import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Node, Edge } from 'reactflow'
import { useAuthStore } from '@/store/auth'
import type { FlowNode, FlowEdge } from '@/hooks/api/flow'

interface UseFlowSocketOptions {
  setNodes: Dispatch<SetStateAction<Node[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  buildNode: (fn: FlowNode) => Node
  buildEdge: (fe: FlowEdge) => Edge
}

export function useFlowSocket({ setNodes, setEdges, buildNode, buildEdge }: UseFlowSocketOptions) {
  const stoppedRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    stoppedRef.current = false

    const token = useAuthStore.getState().token
    if (!token) return

    const apiBase = import.meta.env.VITE_API_URL || window.location.origin
    const wsBase = apiBase.replace(/^http/, 'ws')
    const wsUrl = `${wsBase}/ws/flow?token=${token}`
    let delay = 1000
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (stoppedRef.current) return

      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        return
      }

      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string)

          if (msg.type === 'edge.added') {
            const fe: FlowEdge = msg.data
            setEdges((prev) => {
              if (prev.find((edge) => edge.id === fe.id)) return prev
              return [...prev, buildEdge(fe)]
            })
            // Add node if it doesn't exist yet
            if (msg.fromNode) {
              const fn: FlowNode = msg.fromNode
              setNodes((prev) => {
                if (prev.find((n) => n.id === fn.id)) return prev
                return [...prev, buildNode(fn)]
              })
            }
            if (msg.toNode) {
              const fn: FlowNode = msg.toNode
              setNodes((prev) => {
                if (prev.find((n) => n.id === fn.id)) return prev
                return [...prev, buildNode(fn)]
              })
            }
          }

          if (msg.type === 'edge.batch') {
            const edges: FlowEdge[] = msg.data ?? []
            setEdges((prev) => {
              const existingIds = new Set(prev.map((e) => e.id))
              const newEdges = edges.filter((fe) => !existingIds.has(fe.id)).map(buildEdge)
              return newEdges.length > 0 ? [...prev, ...newEdges] : prev
            })
          }

          if (msg.type === 'node.updated') {
            const fn: FlowNode = msg.data
            setNodes((prev) =>
              prev.map((n) =>
                n.id === fn.id
                  ? { ...n, data: { ...n.data, ...fn } }
                  : n,
              ),
            )
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onopen = () => {
        delay = 1000
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onclose = () => {
        if (stoppedRef.current) return
        timeoutId = setTimeout(() => {
          delay = Math.min(delay * 1.5, 30000)
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
      stoppedRef.current = true
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [setNodes, setEdges, buildNode, buildEdge])
}
