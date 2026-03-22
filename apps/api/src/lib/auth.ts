import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { eq, and, gt } from 'drizzle-orm'
import pino from 'pino'
import { db } from '../db/client.js'
import { users, sessions } from '../db/schema.js'
import { config } from '../config.js'

const log = pino({ name: 'auth' })

/** Timing-safe string comparison for token validation. */
export function safeTokenMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const hashBuffer = Buffer.from(hash, 'hex')
    const derivedHash = scryptSync(password, salt, 64)
    return timingSafeEqual(hashBuffer, derivedHash)
  } catch {
    return false
  }
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const [session] = await db.insert(sessions).values({ userId, expiresAt }).returning()
  return session.id
}

export async function getSessionUser(sessionId: string) {
  const now = new Date()
  const result = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1)
  return result[0] ?? null
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function seedAdmin(): Promise<void> {
  const authUser = process.env.AUTH_USER
  const authPass = process.env.AUTH_PASS
  if (!authUser || !authPass) return

  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) return

  const passwordHash = hashPassword(authPass)
  await db.insert(users).values({ username: authUser, passwordHash, role: 'admin' })
  log.info({ username: authUser }, 'seeded admin user')
}

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)

    // Legacy OPERATOR_TOKEN for agents/automation
    if (safeTokenMatch(token, config.OPERATOR_TOKEN)) {
      c.set('user', { id: 'system', username: 'system', role: 'admin' })
      await next()
      return
    }

    // Session token (UUID) — look up in DB
    const user = await getSessionUser(token)
    if (user) {
      c.set('user', user)
      await next()
      return
    }
  }

  c.status(401)
  c.res = new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function validateWsToken(token: string | null): Promise<boolean> {
  if (!token) return false
  if (safeTokenMatch(token, config.OPERATOR_TOKEN)) return true
  const user = await getSessionUser(token)
  return user !== null
}
