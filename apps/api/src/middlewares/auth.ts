import type { Context, Next } from "hono"
import { db } from "../lib/db.js"
import { sha256 } from "../lib/crypto.js"
import { verifyJwt } from "../lib/jwt.js"

export interface AuthContext {
  userId: string
  merchantId: string
  role: string
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    c.res = c.json({ error: "Missing or invalid Authorization header" }, 401)
    return
  }

  const token = header.slice(7)

  // API key — prefixed with pk_live_ or pk_test_
  if (token.startsWith("pk_live_") || token.startsWith("pk_test_")) {
    const keyHash = sha256(token)
    const apiKey = await db.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, merchantId: true, role: true, deletedAt: true } } },
    })

    if (!apiKey || apiKey.revokedAt || apiKey.user.deletedAt) {
      c.res = c.json({ error: "Invalid or revoked API key" }, 401)
      return
    }

    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })

    c.set("auth", {
      userId: apiKey.user.id,
      merchantId: apiKey.user.merchantId ?? "",
      role: apiKey.user.role,
    })
    await next()
    return
  }

  // JWT — issued by login endpoint
  try {
    const payload = await verifyJwt(token)

    // Check if session was revoked (e.g. after security incident)
    const revoked = await db.revokedSession.findUnique({ where: { jti: payload.jti } })
    if (revoked) {
      c.res = c.json({ error: "Session has been revoked" }, 401)
      return
    }

    c.set("auth", {
      userId: payload.sub,
      merchantId: payload.merchantId,
      role: payload.role,
    })
    await next()
  } catch {
    c.res = c.json({ error: "Invalid or expired token" }, 401)
  }
}

export function requireAdmin(c: Context, next: Next): Promise<void> {
  const auth = c.get("auth")
  if (auth.role !== "ADMIN") {
    c.res = c.json({ error: "Admin access required" }, 403)
    return Promise.resolve()
  }
  return next()
}
