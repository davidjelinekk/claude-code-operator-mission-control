#!/usr/bin/env node
/**
 * MCP stdio server for inter-agent messaging.
 *
 * Zero-dependency MCP server (same pattern as script-mcp-wrapper.mjs)
 * that gives agents tools to send/read messages and discover peers.
 *
 * Env vars:
 *   AGENT_BUS_API_URL  — Mission Control base URL (e.g. http://localhost:3001)
 *   AGENT_BUS_AGENT_ID — This agent's identity
 *   AGENT_BUS_BOARD_ID — Board scope
 *   AGENT_BUS_TOKEN    — OPERATOR_TOKEN for API auth
 */

const API_URL = process.env.AGENT_BUS_API_URL || 'http://localhost:3001'
const AGENT_ID = process.env.AGENT_BUS_AGENT_ID || 'anonymous'
const BOARD_ID = process.env.AGENT_BUS_BOARD_ID || ''
const TOKEN = process.env.AGENT_BUS_TOKEN || ''

// --- Tool definitions ---

const tools = [
  {
    name: 'send_message',
    description: 'Send a message to another agent on this board. Use to="*" for broadcast.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target agent ID or "*" for broadcast' },
        content: { type: 'string', description: 'Message content' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Message priority (default: normal)' },
      },
      required: ['to', 'content'],
    },
  },
  {
    name: 'read_messages',
    description: 'Read messages from your inbox (messages addressed to you + broadcasts).',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO timestamp — only return messages after this time' },
        from: { type: 'string', description: 'Filter by sender agent ID' },
        limit: { type: 'number', description: 'Max messages to return (default: 50)' },
      },
    },
  },
  {
    name: 'list_agents',
    description: 'List active agents on this board.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// --- HTTP helpers ---

async function apiCall(method, path, body) {
  const url = `${API_URL}/api/agent-bus${path}`
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`API ${method} ${path} returned ${res.status}: ${text}`)
  }
  return JSON.parse(text)
}

// --- Tool execution ---

async function executeTool(name, args) {
  if (name === 'send_message') {
    const result = await apiCall('POST', '/send', {
      boardId: BOARD_ID,
      fromAgentId: AGENT_ID,
      toAgentId: args.to,
      content: args.content,
      priority: args.priority,
    })
    return `Message sent to ${args.to} (id: ${result.id})`
  }

  if (name === 'read_messages') {
    const params = new URLSearchParams({ boardId: BOARD_ID, agentId: AGENT_ID })
    if (args.since) params.set('since', args.since)
    if (args.from) params.set('from', args.from)
    if (args.limit) params.set('limit', String(args.limit))
    const messages = await apiCall('GET', `/inbox?${params}`)
    if (messages.length === 0) return 'No messages in inbox.'
    return JSON.stringify(messages, null, 2)
  }

  if (name === 'list_agents') {
    const agents = await apiCall('GET', `/agents?boardId=${encodeURIComponent(BOARD_ID)}`)
    if (agents.length === 0) return 'No other active agents on this board.'
    return JSON.stringify(agents, null, 2)
  }

  throw new Error(`Unknown tool: ${name}`)
}

// --- MCP stdio framing (Content-Length headers) ---

function sendMessage(obj) {
  const body = JSON.stringify(obj)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

function sendResponse(id, result) {
  sendMessage({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  sendMessage({ jsonrpc: '2.0', id, error: { code, message } })
}

// --- MCP stdio message parser (Content-Length framing) ---

let buffer = Buffer.alloc(0)
let expectedLength = -1

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  processBuffer()
})

function processBuffer() {
  while (true) {
    if (expectedLength === -1) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const headerStr = buffer.subarray(0, headerEnd).toString('utf-8')
      const match = headerStr.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      expectedLength = parseInt(match[1], 10)
      buffer = buffer.subarray(headerEnd + 4)
    }

    if (buffer.length < expectedLength) return

    const messageBytes = buffer.subarray(0, expectedLength)
    buffer = buffer.subarray(expectedLength)
    expectedLength = -1

    try {
      const msg = JSON.parse(messageBytes.toString('utf-8'))
      handleMessage(msg).catch((err) => {
        if (msg.id !== undefined) {
          sendError(msg.id, -32603, String(err))
        }
      })
    } catch {
      // Invalid JSON, skip
    }
  }
}

async function handleMessage(msg) {
  const { id, method, params } = msg

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agent-bus', version: '1.0.0' },
    })
    return
  }

  if (method === 'notifications/initialized') {
    return
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools })
    return
  }

  if (method === 'tools/call') {
    const toolName = params?.name
    const toolArgs = params?.arguments || {}

    const toolDef = tools.find((t) => t.name === toolName)
    if (!toolDef) {
      sendResponse(id, {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      })
      return
    }

    try {
      const result = await executeTool(toolName, toolArgs)
      sendResponse(id, {
        content: [{ type: 'text', text: result }],
      })
    } catch (err) {
      sendResponse(id, {
        content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }],
        isError: true,
      })
    }
    return
  }

  if (id !== undefined) {
    sendError(id, -32601, `Unknown method: ${method}`)
  }
}

process.stdin.on('end', () => process.exit(0))
