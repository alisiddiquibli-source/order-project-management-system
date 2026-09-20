const ACCESS_TOKEN_KEY = 'bli_access_token'
const REFRESH_TOKEN_KEY = 'bli_refresh_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Thin fetch wrapper: attaches the bearer token, and on a 401 tries
 * exactly one silent refresh before giving up and forcing a re-login —
 * never loops, never retries more than once.
 */
async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getAccessToken()
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!(options.body instanceof FormData) && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`/api${path}`, { ...options, headers })

  // Only treat a 401 as "your session expired" when a token was actually
  // attached — otherwise this is a fresh, unauthenticated request (login
  // itself, most commonly) and a 401 just means the credentials were
  // wrong. Without this check, a mistyped password triggered a doomed
  // refresh attempt, a hard redirect to /login, and a misleading "Session
  // expired" message instead of the real "Invalid email or password."
  if (response.status === 401 && !isRetry && token) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return request<T>(path, options, true)
    }
    clearTokens()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired.')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'Request failed.')
  }

  return data as T
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!response.ok) return false

    const data = await response.json()
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
    return true
  } catch {
    return false
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
}

/**
 * Downloads a locally-stored document through the authenticated file
 * endpoint and triggers a browser save — a plain <a href> can't attach
 * the bearer token, so this fetches the bytes and hands the browser an
 * object URL instead. Google Drive-backed documents don't go through
 * this: /api/documents/{id}/file returns their Drive file id as JSON,
 * not a byte stream (see DocumentsSection).
 */
export async function downloadDocument(id: number, suggestedName: string): Promise<void> {
  const token = getAccessToken()
  const response = await fetch(`/api/documents/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    throw new ApiError(response.status, 'Could not download the file.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  link.click()
  URL.revokeObjectURL(url)
}
