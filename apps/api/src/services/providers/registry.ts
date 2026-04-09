import type { Provider, ProviderStatus } from '@claude-code-operator/shared-types'
import type { SessionProvider } from './types.js'

const providers = new Map<Provider, SessionProvider>()

export function registerProvider(provider: SessionProvider): void {
  providers.set(provider.name, provider)
}

export function getProvider(name: Provider): SessionProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(`Unknown provider: ${name}. Available: ${[...providers.keys()].join(', ')}`)
  }
  return provider
}

export function getProviderOrNull(name: Provider): SessionProvider | null {
  return providers.get(name) ?? null
}

export function detectAvailableProviders(): ProviderStatus[] {
  return [...providers.values()].map((p) => p.getStatus())
}

export function getAllProviders(): SessionProvider[] {
  return [...providers.values()]
}
