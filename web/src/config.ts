function resolveApiBaseUrl(value = import.meta.env.VITE_API_BASE_URL): string {
  const candidate = value ?? 'http://localhost:3000/api/v1'

  // Production can proxy the API through the Vercel origin so session
  // cookies remain same-site across browsers. Keep absolute URLs supported
  // for local development and direct container deployments.
  if (candidate.startsWith('/')) return candidate.replace(/\/$/, '')

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid HTTP(S) URL.')
  }
}

export const config = {
  apiBaseUrl: resolveApiBaseUrl(),
}
