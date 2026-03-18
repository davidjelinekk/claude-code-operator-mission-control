type WorkerEntry = { lastRunAt: Date | null; ok: boolean }

const registry = new Map<string, WorkerEntry>()

export const workerRegistry = {
  record(name: string, ok: boolean) {
    registry.set(name, { lastRunAt: new Date(), ok })
  },
  getAll(): Record<string, WorkerEntry> {
    return Object.fromEntries(registry)
  },
}
