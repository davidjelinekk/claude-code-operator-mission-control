import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'
import { StatusDot } from '@/components/atoms/StatusDot'
import { useFlowGraph, type FlowNode, type FlowEdge } from '@/hooks/api/flow'
import { useFlowSocket } from '@/hooks/useFlowSocket'

export const Route = createFileRoute('/flow')({
  component: FlowPage,
})

// --- edge helpers ---

const EDGE_COLORS: Record<string, string> = {
  dispatch: '#58a6ff',
  subagent: '#3fb950',
  cron: '#d29922',
  reply: '#6e7681',
}

export function buildEdge(fe: FlowEdge): Edge {
  const color = EDGE_COLORS[fe.messageType] ?? '#6e7681'
  const isRecent = fe.ageMs < 300_000
  return {
    id: fe.id,
    source: fe.fromAgentId,
    target: fe.toAgentId,
    animated: isRecent,
    label: fe.tokenCost != null ? `${fe.messageType} · ${fe.tokenCost.toFixed(4)}` : fe.messageType,
    labelStyle: { fill: '#8b949e', fontSize: 10 },
    labelBgStyle: { fill: '#161b22', fillOpacity: 0.8 },
    style: {
      stroke: color,
      strokeWidth: isRecent ? 2 : 1.5,
      strokeDasharray: isRecent ? '6 3' : undefined,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color },
  }
}

// --- node helpers ---

export function buildNode(fn: FlowNode): Node {
  return {
    id: fn.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
    data: fn,
  }
}

// --- dagre layout ---

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 60 })

  nodes.forEach((n) => g.setNode(n.id, { width: 100, height: 60 }))
  edges.forEach((e) => {
    if (typeof e.source === 'string' && typeof e.target === 'string') {
      g.setEdge(e.source, e.target)
    }
  })
  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: pos ? pos.x - 50 : 0, y: pos ? pos.y - 30 : 0 },
    }
  })
}

// --- custom agent node ---

function AgentNode({ data }: { data: FlowNode }) {
  return (
    <div
      style={{
        width: 120,
        height: 64,
        background: '#161b22',
        borderColor: data.hasEdges ? '#1f6feb' : '#30363d',
        borderWidth: data.hasEdges ? 1.5 : 1,
        borderStyle: 'solid',
        borderRadius: 0,
        opacity: data.hasEdges || data.isOnline ? 1 : 0.45,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '8px 12px',
      }}
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        {data.emoji && <span style={{ fontSize: 14 }}>{data.emoji}</span>}
        <span className="text-[11px] font-medium text-[#e6edf3] truncate flex-1">{data.name}</span>
        <StatusDot status={data.isOnline ? 'online' : 'offline'} />
      </div>
      <div className="text-[10px] mt-1">
        {data.hasActiveSession ? (
          <span className="text-[#3fb950] font-mono">● active</span>
        ) : data.hasEdges ? (
          <span className="text-[#58a6ff] font-mono">· in window</span>
        ) : (
          <span className="text-[#6e7681] font-mono">· idle</span>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }

const TIME_WINDOWS = ['1h', '6h', '24h', '7d'] as const
type TimeWindow = (typeof TIME_WINDOWS)[number]

// --- main page ---

function FlowPage() {
  const [window, setWindow] = useState<TimeWindow>('1h')
  const { data } = useFlowGraph(window)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Build stable callbacks for the socket hook
  const stableBuildNode = useCallback(buildNode, [])
  const stableBuildEdge = useCallback(buildEdge, [])

  // Load data from REST when it arrives
  useEffect(() => {
    if (!data) return

    const rawNodes = data.nodes.map(buildNode)
    const rawEdges = data.edges.map(buildEdge)
    const laidOut = applyLayout(rawNodes, rawEdges)

    setNodes(laidOut)
    setEdges(rawEdges)
  }, [data, setNodes, setEdges])

  // Patch via WebSocket live updates
  useFlowSocket({
    setNodes,
    setEdges,
    buildNode: stableBuildNode,
    buildEdge: stableBuildEdge,
  })

  const hasActivity = edges.length > 0

  return (
    <div className="h-full w-full" style={{ background: '#0d1117' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#21262d" gap={24} />
        <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 0 }} />

        <Panel position="top-right">
          <div className="flex items-center gap-1 border border-[#30363d] bg-[#161b22] p-1">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                  window === w
                    ? 'bg-[#1f6feb] border border-[#388bfd] text-white'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </Panel>

        {!hasActivity && (
          <Panel position="bottom-center">
            <div className="mb-8 border border-[#30363d] bg-[#161b22] px-5 py-3 text-center">
              <p className="font-mono text-[11px] text-[#8b949e]">No agent activity in this window.</p>
              <p className="font-mono text-[10px] text-[#6e7681] mt-1">
                Edges appear when tasks are dispatched to agents or agents post flow edges via{' '}
                <span className="text-[#58a6ff]">POST /api/flow/edges</span>.
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
