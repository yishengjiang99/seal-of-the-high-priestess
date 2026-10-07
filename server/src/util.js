import crypto from 'node:crypto'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v)
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
export const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
export function safeEqual(a, b) {
  const x = Buffer.from(sha256(a), 'hex'), y = Buffer.from(sha256(b), 'hex')
  return crypto.timingSafeEqual(x, y)
}
export const newToken = () => crypto.randomBytes(32).toString('base64url')
export const clientIp = (req) => String(req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64)

/** Fixed-window per-key limiter (in-memory; one process per service). */
export class RateLimiter {
  constructor(limit, windowMs = 60_000) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map() }
  allow(key, now = Date.now()) {
    const h = this.hits.get(key)
    if (!h || h.reset <= now) {
      if (this.hits.size > 50_000) this.hits.clear()
      this.hits.set(key, { n: 1, reset: now + this.windowMs })
      return true
    }
    h.n += 1
    return h.n <= this.limit
  }
}
