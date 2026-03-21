import { CCOperator } from '@cc-operator/sdk'
import { loadConfig } from './config.js'

export { CCOperator } from '@cc-operator/sdk'
export { loadConfig, saveConfig, requireConfig } from './config.js'

export function createClient(): CCOperator {
  const config = loadConfig()
  if (!config) throw new Error('Not configured. Run: cc-operator init')
  return new CCOperator({ baseUrl: config.url, token: config.token })
}
