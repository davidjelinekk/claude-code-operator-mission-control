import { Hono } from 'hono'
import { readMcpConfig } from '../services/claude-code/config-reader.js'

export const mcpServersRouter = new Hono()

mcpServersRouter.get('/', async (c) => {
  const servers = readMcpConfig()
  const list = Object.entries(servers).map(([id, cfg]) => ({
    id,
    command: cfg.command ?? null,
    type: cfg.type ?? 'stdio',
    args: cfg.args ?? [],
    env: cfg.env ? Object.keys(cfg.env) : [],
  }))
  return c.json(list)
})

export default mcpServersRouter
