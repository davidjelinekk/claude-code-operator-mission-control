import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { redis } from '../lib/redis.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { config } from '../config.js'
import { randomUUID } from 'node:crypto'

export const cronRouter = new Hono()

interface CronJob {
  id: string
  name: string
  schedule: string
  agentId: string
  command: string
  enabled: boolean
  lastRunAt?: string | null
  createdAt: string
}

function getCronFilePath(): string {
  return join(config.CLAUDE_HOME, 'cron', 'jobs.json')
}

function loadCronJobs(): CronJob[] {
  try {
    const data = JSON.parse(readFileSync(getCronFilePath(), 'utf-8'))
    return Array.isArray(data) ? data : data?.jobs ?? []
  } catch {
    return []
  }
}

function saveCronJobs(jobs: CronJob[]): void {
  const filePath = getCronFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(jobs, null, 2))
}

cronRouter.get('/', async (c) => {
  const cached = await redis.get('cron:merged')
  if (cached) return c.json(JSON.parse(cached))

  const jobs = loadCronJobs()
  const result = jobs.map((j) => ({
    ...j,
    status: j.enabled ? (j.lastRunAt ? 'ok' : 'idle') : 'disabled',
  }))

  await redis.set('cron:merged', JSON.stringify(result), 'EX', 60)
  return c.json(result)
})

const createCronSchema = z.object({
  name: z.string().min(1),
  schedule: z.string().min(1),
  agentId: z.string().min(1),
  command: z.string().min(1),
})

cronRouter.post('/', zValidator('json', createCronSchema), async (c) => {
  const body = c.req.valid('json')
  const jobs = loadCronJobs()
  const newJob: CronJob = {
    id: randomUUID(),
    name: body.name,
    schedule: body.schedule,
    agentId: body.agentId,
    command: body.command,
    enabled: true,
    createdAt: new Date().toISOString(),
  }
  jobs.push(newJob)
  saveCronJobs(jobs)
  await redis.del('cron:merged')
  return c.json(newJob, 201)
})

cronRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const jobs = loadCronJobs()
  const filtered = jobs.filter((j) => j.id !== id)
  if (filtered.length === jobs.length) return c.json({ error: 'Not found' }, 404)
  saveCronJobs(filtered)
  await redis.del('cron:merged')
  return c.json({ ok: true })
})

cronRouter.post('/:id/run', async (c) => {
  const id = c.req.param('id')
  const jobs = loadCronJobs()
  const job = jobs.find((j) => j.id === id)
  if (!job) return c.json({ error: 'Not found' }, 404)
  job.lastRunAt = new Date().toISOString()
  saveCronJobs(jobs)
  await redis.del('cron:merged')
  return c.json({ ok: true, job })
})

cronRouter.get('/:id/runs', async (c) => {
  return c.json([])
})

export default cronRouter
