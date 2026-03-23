import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

const client = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  connection: {
    statement_timeout: '30000' as unknown as number,
  },
})
export const db = drizzle(client, { schema })
