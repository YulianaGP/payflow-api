import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { nanoid } from "nanoid"
import { randomBytes } from "node:crypto"
import { db } from "../lib/db.js"
import { sha256 } from "../lib/crypto.js"
import { signJwt } from "../lib/jwt.js"
import { authMiddleware } from "../middlewares/auth.js"
import { createRateLimiter } from "../lib/rateLimiter.js"

export const authRouter = new Hono()

const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  merchantId: z.string(),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the data consent to register" }),
  }),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

const loginRateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })

authRouter.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, name, merchantId, consentAccepted: _ } = c.req.valid("json")

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return c.json({ error: "Email already registered" }, 409)

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } })
  if (!merchant) return c.json({ error: "Merchant not found" }, 404)

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown"
  const userAgent = c.req.header("user-agent") ?? "unknown"

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, passwordHash: sha256(password), merchantId },
    })
    await tx.userConsent.create({
      data: { userId: created.id, ipAddress: ip, userAgent, version: "1.0" },
    })
    return created
  })

  const jti = nanoid()
  const token = await signJwt({ sub: user.id, merchantId, role: user.role, jti })
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_MS).toISOString()

  return c.json(
    { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role, merchantId } },
    201
  )
})

authRouter.post("/login", loginRateLimiter, zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json")

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, merchantId: true, passwordHash: true, deletedAt: true },
  })

  if (!user || user.deletedAt || user.passwordHash !== sha256(password)) {
    return c.json({ error: "Invalid credentials" }, 401)
  }

  const jti = nanoid()
  const merchantId = user.merchantId ?? ""
  const token = await signJwt({ sub: user.id, merchantId, role: user.role, jti })
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_MS).toISOString()

  return c.json({
    token,
    expiresAt,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, merchantId },
  })
})

authRouter.post("/logout", authMiddleware, async (c) => {
  const auth = c.get("auth")
  const header = c.req.header("Authorization")!
  const token = header.slice(7)

  try {
    const { verifyJwt } = await import("../lib/jwt.js")
    const payload = await verifyJwt(token)
    const expiresAt = new Date((payload as any).exp * 1000)

    await db.revokedSession.create({
      data: { jti: payload.jti, userId: auth.userId, expiresAt },
    })
  } catch {
    // token invalid — nothing to revoke
  }

  return c.json({ message: "Logged out" })
})

authRouter.post("/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
  const { email } = c.req.valid("json")

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true },
  })

  // Always return 200 — prevents email enumeration attacks
  if (!user || user.deletedAt) {
    return c.json({ message: "If your email is registered, you will receive a reset link shortly" })
  }

  const resetToken = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: { userId: user.id, token: resetToken, expiresAt },
    })
    // Outbox: email worker (P2-2) will pick this up and send the reset email
    await tx.outboxEvent.create({
      data: {
        type: "auth.password_reset",
        category: "email",
        payload: { userId: user.id, email, resetToken, expiresAt: expiresAt.toISOString() },
      },
    })
  })

  return c.json({ message: "If your email is registered, you will receive a reset link shortly" })
})

authRouter.post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
  const { token, password } = c.req.valid("json")

  const resetRecord = await db.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, deletedAt: true } } },
  })

  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date() || resetRecord.user.deletedAt) {
    return c.json({ error: "Invalid or expired reset token" }, 400)
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash: sha256(password) },
    })
    await tx.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    })
    // Note: existing JWT sessions remain valid for their 7-day window after password reset.
    // Full session invalidation requires a passwordVersion counter in the JWT payload (Phase 7).
  })

  return c.json({ message: "Password updated successfully" })
})

// GET /me — current user profile
authRouter.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth")
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true, merchantId: true },
  })
  if (!user) return c.json({ error: "User not found" }, 404)
  return c.json(user)
})

// GET /me/export — LATAM data portability (Ley 25.326 Argentina, LFPDPPP Mexico, Ley 1581 Colombia)
// Returns all personal data stored for this user as JSON
authRouter.get("/me/export", authMiddleware, async (c) => {
  const { userId } = c.get("auth")

  const [user, consent, payments] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
    db.userConsent.findUnique({ where: { userId }, select: { acceptedAt: true, version: true } }),
    db.payment.findMany({
      where: { merchant: { users: { some: { id: userId } } } },
      select: { id: true, orderId: true, status: true, amount: true, currency: true, createdAt: true },
      take: 1000,
    }),
  ])

  if (!user) return c.json({ error: "User not found" }, 404)

  const export_data = {
    exportedAt: new Date().toISOString(),
    user,
    consent,
    payments,
  }

  c.header("Content-Type", "application/json; charset=utf-8")
  c.header("Content-Disposition", `attachment; filename="payflow-data-export-${userId}.json"`)
  return c.json(export_data)
})

// DELETE /me — GDPR/LATAM right to erasure (soft delete + PII anonymization)
// Payments are retained for accounting/legal obligations but stripped of personal identifiers
authRouter.delete("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth")
  await db.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), email: `deleted+${userId}@payflow.invalid`, name: null, passwordHash: null },
  })
  return c.json({ message: "Account deleted" })
})
