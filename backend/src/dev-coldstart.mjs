// Dev-only cold-start simulator. Run the real backend on another port and put
// this in front of it to fake a sleeping Render instance:
//   PORT=3001 npm run dev            (real backend)
//   SESSION_DELAY_MS=15000 node src/dev-coldstart.mjs   (this proxy, listens on 3000)
// Only GET /api/v1/auth/session is delayed; everything else is proxied as-is.
import { createServer } from 'node:http'

const listenPort = Number(process.env.COLDSTART_PORT ?? 3000)
const targetPort = Number(process.env.TARGET_PORT ?? 3001)
const sessionDelayMs = Number(process.env.SESSION_DELAY_MS ?? 15000)

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${listenPort}`)
  const isSession = url.pathname === '/api/v1/auth/session'
  if (isSession) console.log(`[coldstart] delaying ${url.pathname} by ${sessionDelayMs}ms`)

  const chunks = []
  for await (const chunk of request) chunks.push(chunk)

  const forward = async () => {
    const target = await fetch(`http://localhost:${targetPort}${url.pathname}${url.search}`, {
      method: request.method,
      headers: { cookie: request.headers.cookie ?? '', origin: request.headers.origin ?? '', 'content-type': request.headers['content-type'] ?? '' },
      body: chunks.length && request.method !== 'GET' && request.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
      duplex: 'half',
    })
    const body = Buffer.from(await target.arrayBuffer())
    const headers = {}
    target.headers.forEach((value, key) => { if (!['transfer-encoding', 'connection'].includes(key)) headers[key] = value })
    response.writeHead(target.status, headers)
    response.end(body)
  }

  try {
    if (isSession) setTimeout(() => { void forward().catch(passThroughError) }, sessionDelayMs)
    else await forward()
  } catch (error) {
    passThroughError(error)
  }
})
  .on('error', (error) => { console.error('[coldstart]', error.message); process.exit(1) })
  .listen(listenPort, '127.0.0.1', () => {
    console.log(`[coldstart] proxy on http://localhost:${listenPort} -> :${targetPort}, /auth/session delayed ${sessionDelayMs}ms`)
  })

function passThroughError(error) {
  console.error('[coldstart] upstream error:', error.message)
}
