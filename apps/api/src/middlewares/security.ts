import type { Context, Next } from "hono"

// Security headers applied to every response
// These protect against common browser-level attacks without needing a CDN
export async function securityHeaders(c: Context, next: Next): Promise<void> {
  await next()
  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("X-Frame-Options", "DENY")
  c.res.headers.set("X-XSS-Protection", "1; mode=block")
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  // CSP: allow same-origin only — SDKs (Stripe.js, MP) are loaded client-side in Next.js, not here
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'none'"
  )
}
