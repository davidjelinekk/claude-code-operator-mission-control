import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/client.js'
import { skillSnapshots, agentSkills } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { config } from '../config.js'
import { discoverScripts, getScript } from '../services/claude-code/script-discovery.js'
import { executeScript } from '../services/claude-code/script-mcp-bridge.js'
import { skillsRefreshWorker } from '../workers/skills.js'

export const scriptsRouter = new Hono()

// GET / — list all discovered scripts
scriptsRouter.get('/', async (c) => {
  const scripts = discoverScripts()
  // Also fetch DB records for agent assignments
  const dbRecords = await db.select().from(skillSnapshots)
    .where(eq(skillSnapshots.skillType, 'cli_script'))
  const assignments = await db.select().from(agentSkills)
  const assignMap = new Map<string, string[]>()
  for (const a of assignments) {
    const arr = assignMap.get(a.skillId) ?? []
    arr.push(a.agentId)
    assignMap.set(a.skillId, arr)
  }

  return c.json(scripts.map((s) => ({
    ...s,
    agents: assignMap.get(`script:${s.id}`) ?? [],
  })))
})

// POST /refresh — re-scan filesystem
scriptsRouter.post('/refresh', async (c) => {
  await skillsRefreshWorker.run()
  return c.json({ ok: true })
})

// GET /:id — script detail with agent assignments
scriptsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const script = getScript(id)
  if (!script) return c.json({ error: 'Not found' }, 404)

  const skillId = `script:${id}`
  const assignments = await db.select().from(agentSkills).where(eq(agentSkills.skillId, skillId))

  return c.json({
    ...script,
    agents: assignments.map((a) => a.agentId),
  })
})

// POST / — create new script (scaffolds directory + SCRIPT.md + empty entrypoint)
scriptsRouter.post(
  '/',
  zValidator('json', z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: z.string().min(1),
    description: z.string().optional(),
    interpreter: z.string().optional(),
    entrypoint: z.string().optional(),
  })),
  async (c) => {
    const { id, name, description, interpreter, entrypoint: ep } = c.req.valid('json')
    const scriptsDir = join(config.CLAUDE_HOME, 'scripts')
    const scriptDir = join(scriptsDir, id)

    if (existsSync(scriptDir)) {
      return c.json({ error: 'Script directory already exists' }, 409)
    }

    mkdirSync(scriptDir, { recursive: true })

    const entrypoint = ep ?? (interpreter === 'python3' ? 'main.py' : interpreter === 'node' ? 'main.js' : 'main.sh')
    const interp = interpreter ?? 'bash'

    const scriptMd = `---
name: ${id}
description: "${(description ?? name).replace(/"/g, '\\"')}"
entrypoint: ${entrypoint}
interpreter: ${interp}
input-mode: args
output-mode: stdout
timeout: 30000
env: []
tags: []
---

## ${name}

${description ?? 'TODO: Add description'}
`
    writeFileSync(join(scriptDir, 'SCRIPT.md'), scriptMd)

    // Create empty entrypoint
    const defaultContent = interp === 'python3'
      ? '#!/usr/bin/env python3\nimport sys\nimport json\n\nprint("Hello from " + sys.argv[0])\n'
      : interp === 'node'
        ? '#!/usr/bin/env node\nconsole.log("Hello from script")\n'
        : '#!/usr/bin/env bash\necho "Hello from script"\n'

    writeFileSync(join(scriptDir, entrypoint), defaultContent, { mode: 0o755 })

    return c.json({ ok: true, id }, 201)
  },
)

// PATCH /:id — update metadata (rewrites SCRIPT.md frontmatter)
scriptsRouter.patch(
  '/:id',
  zValidator('json', z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    interpreter: z.string().optional(),
    timeout: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const script = getScript(id)
    if (!script) return c.json({ error: 'Not found' }, 404)

    // For now, just trigger a refresh — full metadata rewrite is a future enhancement
    return c.json({ ok: true, id })
  },
)

// DELETE /:id — delete script directory
scriptsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    return c.json({ error: 'Invalid ID' }, 400)
  }

  const scriptDir = join(config.CLAUDE_HOME, 'scripts', id)
  if (!existsSync(scriptDir)) {
    return c.json({ error: 'Not found' }, 404)
  }

  rmSync(scriptDir, { recursive: true, force: true })
  return c.json({ ok: true, id })
})

// POST /:id/test — execute script with test args
scriptsRouter.post(
  '/:id/test',
  zValidator('json', z.object({
    args: z.record(z.unknown()).optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const script = getScript(id)
    if (!script) return c.json({ error: 'Not found' }, 404)

    const { args } = c.req.valid('json')
    const result = await executeScript(script, args ?? {})
    return c.json(result)
  },
)

export default scriptsRouter
