import { CCOperatorError, type CCOperatorConfig } from './types.js'

export class HttpClient {
  private baseUrl: string
  private token?: string
  private timeout: number

  constructor(config: CCOperatorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
    this.timeout = config.timeout ?? 30000
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'User-Agent': 'cc-operator-sdk/0.1.0', ...extra }
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const hdrs = body !== undefined
      ? { ...this.headers(), 'Content-Type': 'application/json' }
      : this.headers()
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: hdrs,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      })
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new CCOperatorError(0, `Request timeout after ${this.timeout}ms`)
      }
      throw new CCOperatorError(0, `Network error: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (!res.ok) {
      let errorBody: unknown
      try { errorBody = await res.json() } catch { errorBody = await res.text() }
      const message = typeof errorBody === 'object' && errorBody && 'error' in errorBody
        ? String((errorBody as { error: string }).error)
        : `HTTP ${res.status}`
      throw new CCOperatorError(res.status, message, errorBody)
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T
    }
    return res.json() as Promise<T>
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  /**
   * Build a full URL for server-sent events.
   * Note: Token is passed as query parameter because the EventSource API
   * does not support custom headers. The server should ensure access logs
   * redact query parameters containing tokens.
   */
  sseUrl(path: string): string {
    let url = `${this.baseUrl}${path}`
    if (this.token) {
      const sep = url.includes('?') ? '&' : '?'
      url += `${sep}token=${encodeURIComponent(this.token)}`
    }
    return url
  }

  getToken(): string | undefined {
    return this.token
  }
}
