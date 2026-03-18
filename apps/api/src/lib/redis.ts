import { Redis } from 'ioredis'
import { config } from '../config.js'

export const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })
export const redisSub = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })

redis.on('error', (err: Error) => console.error('[redis] error:', err.message))
redisSub.on('error', (err: Error) => console.error('[redis-sub] error:', err.message))
