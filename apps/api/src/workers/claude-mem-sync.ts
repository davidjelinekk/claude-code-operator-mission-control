import pino from 'pino'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { upsertEntity, addObservation } from '../services/context-graph/graph-store.js'
import { workerRegistry } from '../lib/workerRegistry.js'

const log = pino({ name: 'claude-mem-sync' })

// claude-mem stores its data in a SQLite DB.
// This worker reads new observations and syncs them into the context graph.
// It requires the `better-sqlite3` package or similar — for now, we use a simpler
// approach: read the claude-mem SQLite via the sqlite3 CLI tool.

let lastSyncTimestamp: string | null = null

const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/

function getClaudeMemDbPath(): string | null {
  const envPath = process.env.CLAUDE_MEM_DB_PATH
  if (envPath && existsSync(envPath)) return envPath

  // Default path based on claude-mem plugin cache location
  const defaultPath = join(config.CLAUDE_HOME, 'plugins', 'cache', 'thedotmack', 'claude-mem', '10.3.1', 'data', 'memory.db')
  if (existsSync(defaultPath)) return defaultPath

  // Try alternative common locations
  const altPath = join(config.CLAUDE_HOME, 'claude-mem.db')
  if (existsSync(altPath)) return altPath

  return null
}

async function runSync(): Promise<void> {
  const dbPath = getClaudeMemDbPath()
  if (!dbPath) {
    log.debug('claude-mem DB not found, skipping sync')
    workerRegistry.record('claude-mem-sync', true)
    return
  }

  try {
    // Use child_process to query SQLite (avoids native module dependency)
    const { execSync } = await import('node:child_process')

    // Validate timestamp format to prevent shell injection
    const whereClause = lastSyncTimestamp && ISO_RE.test(lastSyncTimestamp)
      ? `WHERE created_at > '${lastSyncTimestamp}'`
      : 'WHERE 1=1'

    const result = execSync(
      `sqlite3 -json "${dbPath}" "SELECT id, content, type, entity_name, created_at FROM observations ${whereClause} ORDER BY created_at ASC LIMIT 50"`,
      { encoding: 'utf-8', timeout: 10000 },
    ).trim()

    if (!result || result === '[]') {
      workerRegistry.record('claude-mem-sync', true)
      return
    }

    const observations = JSON.parse(result) as Array<{
      id: string
      content: string
      type: string
      entity_name: string
      created_at: string
    }>

    let synced = 0

    for (const obs of observations) {
      try {
        const entityId = await upsertEntity({
          name: obs.entity_name || 'unknown',
          entityType: 'concept',
          sourceType: 'claude-mem',
        })

        const obsId = await addObservation({
          entityId,
          content: obs.content,
          observationType: obs.type === 'error' ? 'error' : 'fact',
          source: 'claude-mem',
          sourceId: obs.id,
        })

        if (obsId) synced++
        lastSyncTimestamp = obs.created_at
      } catch (err) {
        log.debug({ err, obsId: obs.id }, 'failed to sync claude-mem observation')
      }
    }

    if (synced > 0) {
      log.info({ synced }, 'claude-mem sync complete')
    }
  } catch (err) {
    // sqlite3 CLI might not be available — that's fine
    log.debug({ err }, 'claude-mem sync error (sqlite3 CLI may not be available)')
  }

  workerRegistry.record('claude-mem-sync', true)
}

export const claudeMemSyncWorker = { run: runSync }
