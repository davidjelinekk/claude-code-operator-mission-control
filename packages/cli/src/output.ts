import chalk from 'chalk'

function visibleLength(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
}

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(visibleLength(h), ...rows.map(r => visibleLength(r[i] ?? '')))
  )

  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼')
  const header = headers.map((h, i) => {
    const pad = widths[i] - visibleLength(h)
    return ` ${chalk.bold(h)}${' '.repeat(pad)} `
  }).join('│')
  const body = rows.map(row =>
    row.map((cell, i) => {
      const c = cell ?? ''
      const pad = widths[i] - visibleLength(c)
      return ` ${c}${' '.repeat(pad)} `
    }).join('│')
  ).join('\n')

  return `${header}\n${sep}\n${body}`
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export function statusColor(status: string): string {
  switch (status) {
    case 'inbox': return chalk.gray(status)
    case 'in_progress': return chalk.blue(status)
    case 'review': return chalk.yellow(status)
    case 'done': return chalk.green(status)
    case 'running': return chalk.blue(status)
    case 'completed': return chalk.green(status)
    case 'error': return chalk.red(status)
    case 'aborted': return chalk.red(status)
    default: return status
  }
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case 'high': return chalk.red(priority)
    case 'medium': return chalk.yellow(priority)
    case 'low': return chalk.gray(priority)
    default: return priority
  }
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
