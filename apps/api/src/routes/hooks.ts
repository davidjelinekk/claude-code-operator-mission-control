import { Hono } from 'hono'
import { readAllHooks } from '../services/claude-code/hooks-reader.js'

export const hooksRouter = new Hono()

hooksRouter.get('/', async (c) => {
  const hooks = readAllHooks()
  return c.json(hooks)
})

export default hooksRouter
