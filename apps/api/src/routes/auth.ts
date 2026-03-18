import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import {
  verifyPassword,
  hashPassword,
  createSession,
  getSessionUser,
  deleteSession,
} from '../lib/auth.js'

const router = new Hono()

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

router.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json')

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const sessionId = await createSession(user.id)
  return c.json({ id: user.id, username: user.username, role: user.role, sessionToken: sessionId })
})

router.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    await deleteSession(token)
  }
  return c.json({ ok: true })
})

router.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  // Session IDs are UUIDs — reject non-UUID tokens early to avoid DB errors
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(token)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const user = await getSessionUser(token)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return c.json(user)
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

router.post('/change-password', zValidator('json', changePasswordSchema), async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  const sessionUser = await getSessionUser(token)
  if (!sessionUser) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { currentPassword, newPassword } = c.req.valid('json')
  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return c.json({ error: 'Current password is incorrect' }, 400)
  }

  await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, user.id))
  return c.json({ ok: true })
})

export default router
