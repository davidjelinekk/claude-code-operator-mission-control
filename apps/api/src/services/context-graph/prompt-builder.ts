import type { ContextBlock } from './context-retriever.js'

export function buildContextPrompt(blocks: ContextBlock[]): string {
  if (blocks.length === 0) return ''

  const knowledgeBlocks = blocks.filter(
    (b) => b.source.startsWith('vector/') || b.source.startsWith('graph/') || b.source.startsWith('observation/'),
  )
  const boardBlocks = blocks.filter((b) => b.source === 'board-memory')
  const archiveBlocks = blocks.filter((b) => b.source.startsWith('session-archive/'))

  const sections: string[] = []

  if (knowledgeBlocks.length > 0) {
    sections.push('## Relevant Knowledge')
    for (const block of knowledgeBlocks) {
      sections.push(`- ${block.content}`)
    }
  }

  if (boardBlocks.length > 0) {
    sections.push('')
    sections.push('## Board Context')
    for (const block of boardBlocks) {
      sections.push(`- ${block.content}`)
    }
  }

  // Enhancement 2: Session archive blocks
  if (archiveBlocks.length > 0) {
    sections.push('')
    sections.push('## Recent Session History')
    for (const block of archiveBlocks) {
      sections.push(`- ${block.content}`)
    }
  }

  return `<context>\n${sections.join('\n')}\n</context>`
}
