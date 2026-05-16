import type { Context, Next } from "hono"

export interface RateLimiterStore {
  increment(key: string, windowMs: number): Promise<number>
}

class InMemoryStore implements RateLimiterStore {
  private counts = new Map<string, { count: number; resetAt: number }>()

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now()
    const entry = this.counts.get(key)

    if (!entry || entry.resetAt <= now) {
      this.counts.set(key, { count: 1, resetAt: now + windowMs })
      return 1
    }

    entry.count++
    return entry.count
  }
}

let warnedAboutInMemory = false

export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  store?: RateLimiterStore
}) {
  let store: RateLimiterStore

  if (opts.store) {
    store = opts.store
  } else if (process.env["NODE_ENV"] === "production" && !process.env["REDIS_URL"]) {
    throw new Error("[rate-limiter] REDIS_URL is required in production")
  } else {
    if (!warnedAboutInMemory && process.env["NODE_ENV"] !== "test") {
      console.warn("[rate-limiter] Using in-memory store — not safe for multi-instance deployments")
      warnedAboutInMemory = true
    }
    store = new InMemoryStore()
  }

  return async function rateLimiterMiddleware(c: Context, next: Next): Promise<void> {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown"
    const count = await store.increment(ip, opts.windowMs)

    if (count > opts.limit) {
      c.res = c.json({ error: "Too many requests", code: "RATE_LIMIT_EXCEEDED" }, 429)
      return
    }

    await next()
  }
}
