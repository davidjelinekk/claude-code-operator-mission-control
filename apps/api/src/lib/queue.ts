import { Queue, Worker, type Job } from 'bullmq'
import { config } from '../config.js'
import pino from 'pino'

const log = pino({ name: 'queue' })

// Parse Redis URL for BullMQ connection
function parseRedisUrl(url: string): { host: string; port: number; db?: number } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379'),
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) || undefined : undefined,
    }
  } catch {
    return { host: '127.0.0.1', port: 6379 }
  }
}

const connection = parseRedisUrl(config.REDIS_URL)

export type JobType = 'embed' | 'extract' | 'sync-claude-mem' | 'reindex'

export interface EmbedJobData {
  type: 'embed'
  sourceTable: string
  sourceId: string
  content: string
  metadata?: Record<string, unknown>
}

export interface ExtractJobData {
  type: 'extract'
  eventId: string
  eventType: string
  message: string
  boardId?: string
}

export interface ReindexJobData {
  type: 'reindex'
  boardId: string
}

export type JobData = EmbedJobData | ExtractJobData | ReindexJobData | { type: 'sync-claude-mem' }

const QUEUE_NAME = 'context-graph'

let _queue: Queue<JobData> | null = null
let _worker: Worker<JobData> | null = null

export function getQueue(): Queue<JobData> {
  if (!_queue) {
    _queue = new Queue<JobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return _queue
}

export function createWorker(
  processor: (job: Job<JobData>) => Promise<void>,
  concurrency = 3,
): Worker<JobData> {
  if (_worker) return _worker

  _worker = new Worker<JobData>(QUEUE_NAME, processor, {
    connection,
    concurrency,
  })

  _worker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, type: job?.data?.type, err: err.message }, 'job failed')
  })

  _worker.on('completed', (job) => {
    log.debug({ jobId: job.id, type: job.data.type }, 'job completed')
  })

  return _worker
}

export async function addJob(data: JobData, opts?: { priority?: number; delay?: number }): Promise<void> {
  const queue = getQueue()
  await queue.add(data.type, data, {
    priority: opts?.priority,
    delay: opts?.delay,
  })
}

export async function closeQueue(): Promise<void> {
  if (_worker) {
    await _worker.close()
    _worker = null
  }
  if (_queue) {
    await _queue.close()
    _queue = null
  }
}
