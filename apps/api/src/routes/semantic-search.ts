import { Hono } from 'hono'
import { db } from '../db/client.js'
import { tasks, boards } from '../db/schema.js'
import { sql, ilike, or } from 'drizzle-orm'
import { embedText, isEmbeddingAvailable } from '../services/embedding/client.js'

const router = new Hono()

router.get('/semantic', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.json({ results: [] })

  const boardId = c.req.query('boardId')
  const sourceTable = c.req.query('sourceTable')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '10'), 50)

  const available = await isEmbeddingAvailable()
  if (!available) {
    // Fallback to ILIKE
    const pattern = `%${q}%`
    const [matchedTasks, matchedBoards] = await Promise.all([
      db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, boardId: tasks.boardId })
        .from(tasks)
        .where(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)))
        .limit(limit),
      db
        .select({ id: boards.id, name: boards.name, slug: boards.slug })
        .from(boards)
        .where(or(ilike(boards.name, pattern), ilike(boards.description, pattern)))
        .limit(5),
    ])
    return c.json({ results: [], fallback: true, tasks: matchedTasks, boards: matchedBoards })
  }

  const vec = await embedText(q)
  if (!vec) {
    return c.json({ results: [], error: 'embedding failed' })
  }

  const vecStr = `[${vec.join(',')}]`

  const results = await db.execute(sql`
    SELECT
      e.id,
      e.source_table,
      e.source_id,
      e.content,
      e.metadata,
      1 - (e.embedding <=> ${vecStr}::vector) as similarity
    FROM embeddings e
    WHERE e.embedding IS NOT NULL
      ${sourceTable ? sql`AND e.source_table = ${sourceTable}` : sql``}
      ${boardId ? sql`AND e.metadata->>'boardId' = ${boardId}` : sql``}
    ORDER BY e.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `)

  return c.json({ results })
})

export default router
