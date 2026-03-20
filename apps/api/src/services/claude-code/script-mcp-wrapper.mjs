#!/usr/bin/env node
/**
 * MCP stdio wrapper for CLI scripts.
 *
 * Lightweight MCP server that exposes CLI scripts as tools.
 * Reads SCRIPT_DEFS from the environment (JSON-encoded map of script definitions)
 * and implements the MCP stdio protocol (JSON-RPC with Content-Length framing).
 */

import { spawn } from 'node:child_process'

const scriptDefs = JSON.parse(process.env.SCRIPT_DEFS || '{}')

function buildToolsList() {
  return Object.values(scriptDefs).map((s) => ({
    name: s.id,
    description: s.description || s.id,
    inputSchema: s.argsSchema || {
      type: 'object',
      properties: {},
    },
  }))
}

function buildCommand(script) {
  // TypeScript files need tsx to run
  if (script.interpreter === 'tsx') {
    return { cmd: 'npx', prependArgs: ['tsx', script.executablePath] }
  }
  return { cmd: script.interpreter, prependArgs: [script.executablePath] }
}

async function executeScript(script, args) {
  return new Promise((resolve) => {
    const start = Date.now()
    const { cmd, prependArgs } = buildCommand(script)
    const spawnArgs = [...prependArgs]

    const env = { ...process.env }
    delete env.SCRIPT_DEFS

    if (script.inputMode === 'args') {
      for (const [key, value] of Object.entries(args || {})) {
        if (value === true) {
          spawnArgs.push(`--${key}`)
        } else if (value !== false && value !== undefined && value !== null) {
          spawnArgs.push(`--${key}`, String(value))
        }
      }
    } else if (script.inputMode === 'env') {
      for (const [key, value] of Object.entries(args || {})) {
        env[`SCRIPT_ARG_${key.toUpperCase()}`] = String(value ?? '')
      }
    }

    let resolved = false
    const finish = (result) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(result)
    }

    const proc = spawn(cmd, spawnArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    if (script.inputMode === 'stdin') {
      proc.stdin.write(JSON.stringify(args || {}))
      proc.stdin.end()
    }

    const timeout = script.timeout || 30000
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      setTimeout(() => { if (!resolved) proc.kill('SIGKILL') }, 2000)
      finish({
        exitCode: 124,
        stdout: stdout.trim(),
        stderr: (stderr.trim() + '\n[timeout after ' + timeout + 'ms]').trim(),
        durationMs: Date.now() - start,
      })
    }, timeout)

    proc.on('close', (code) => {
      finish({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - start,
      })
    })

    proc.on('error', (err) => {
      finish({
        exitCode: 1,
        stdout: '',
        stderr: String(err),
        durationMs: Date.now() - start,
      })
    })
  })
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
      // Look for Content-Length header
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return // Need more data

      const headerStr = buffer.subarray(0, headerEnd).toString('utf-8')
      const match = headerStr.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // Skip malformed header, try to find next one
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      expectedLength = parseInt(match[1], 10)
      buffer = buffer.subarray(headerEnd + 4)
    }

    if (buffer.length < expectedLength) return // Need more data

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
      serverInfo: { name: 'script-runner', version: '1.0.0' },
    })
    return
  }

  if (method === 'notifications/initialized') {
    return
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: buildToolsList() })
    return
  }

  if (method === 'tools/call') {
    const toolName = params?.name
    const toolArgs = params?.arguments || {}
    const script = scriptDefs[toolName]

    if (!script) {
      sendResponse(id, {
        content: [{ type: 'text', text: `Unknown script: ${toolName}` }],
        isError: true,
      })
      return
    }

    const result = await executeScript(script, toolArgs)

    if (result.exitCode !== 0) {
      sendResponse(id, {
        content: [{ type: 'text', text: result.stderr || result.stdout || `Script exited with code ${result.exitCode}` }],
        isError: true,
      })
      return
    }

    let text = result.stdout
    if (script.outputMode === 'json') {
      try {
        JSON.parse(text)
      } catch {
        text = `[JSON parse error] ${text}`
      }
    }

    sendResponse(id, {
      content: [{ type: 'text', text: text || '(no output)' }],
    })
    return
  }

  if (id !== undefined) {
    sendError(id, -32601, `Unknown method: ${method}`)
  }
}

process.stdin.on('end', () => process.exit(0))
