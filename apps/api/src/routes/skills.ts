import { Hono } from 'hono'
import { db } from '../db/client.js'
import { skillSnapshots, agentSkills } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { skillsRefreshWorker } from '../workers/skills.js'

export const skillsRouter = new Hono()

skillsRouter.get('/', async (c) => {
  const skills = await db.select().from(skillSnapshots).orderBy(skillSnapshots.displayName)
  const assignments = await db.select().from(agentSkills)
  const assignMap = new Map<string, string[]>()
  for (const a of assignments) {
    const arr = assignMap.get(a.skillId) ?? []
    arr.push(a.agentId)
    assignMap.set(a.skillId, arr)
  }
  return c.json(skills.map((s) => ({ ...s, agents: assignMap.get(s.skillId) ?? [] })))
})

skillsRouter.post('/refresh', async (c) => {
  await skillsRefreshWorker.run()
  return c.json({ ok: true })
})

skillsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [skill] = await db.select().from(skillSnapshots).where(eq(skillSnapshots.skillId, id))
  if (!skill) return c.json({ error: 'Not found' }, 404)
  const assignments = await db.select().from(agentSkills).where(eq(agentSkills.skillId, id))
  return c.json({ ...skill, agents: assignments.map((a) => a.agentId) })
})

export default skillsRouter
