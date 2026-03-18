import { Hono } from 'hono'
import { db } from '../db/client.js'
import { tasks, boards } from '../db/schema.js'
import { ilike, or, eq } from 'drizzle-orm'

export const searchRouter = new Hono()

searchRouter.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.json({ tasks: [], boards: [] })

  const pattern = `%${q}%`

  const [matchedTasks, matchedBoards] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        boardId: tasks.boardId,
        boardName: boards.name,
      })
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .where(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)))
      .limit(10),
    db
      .select({ id: boards.id, name: boards.name, slug: boards.slug })
      .from(boards)
      .where(or(ilike(boards.name, pattern), ilike(boards.description, pattern), ilike(boards.slug, pattern)))
      .limit(5),
  ])

  return c.json({ tasks: matchedTasks, boards: matchedBoards })
})

export default searchRouter
