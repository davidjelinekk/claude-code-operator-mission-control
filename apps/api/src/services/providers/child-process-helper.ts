import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

export interface CliProcess {
  process: ChildProcess
  /** Async generator yielding stdout lines */
  lines: AsyncGenerator<string, void>
  /** Send SIGTERM to the child process */
  abort(): void
  /** Graceful close: SIGTERM then SIGKILL after timeout */
  close(): void
}

export function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): CliProcess {
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  })

  const rl = createInterface({ input: child.stdout! })

  // Track whether the process has exited so the generator can terminate
  let processExited = false
  let exitResolve: (() => void) | null = null
  const exitPromise = new Promise<void>((resolve) => { exitResolve = resolve })

  child.on('close', () => {
    processExited = true
    exitResolve?.()
    rl.close()
  })

  child.on('error', () => {
    processExited = true
    exitResolve?.()
    rl.close()
  })

  async function* readLines(): AsyncGenerator<string, void> {
    try {
      for await (const line of rl) {
        yield line
      }
    } finally {
      // Ensure readline is closed even if consumer breaks out early
      rl.close()
      // Wait for process to fully exit if it hasn't already
      if (!processExited) {
        await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 3000))])
      }
    }
  }

  function cleanup() {
    rl.close()
    if (!child.killed) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 5000)
    }
  }

  return {
    process: child,
    lines: readLines(),
    abort() {
      rl.close()
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    },
    close: cleanup,
  }
}
