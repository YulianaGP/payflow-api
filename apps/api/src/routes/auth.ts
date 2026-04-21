import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { nanoid } from "nanoid"
import { db } from "../lib/db.js"
import { sha256 } from "../lib/crypto.js"
import { signJwt } from "../lib/jwt.js"
import { authMiddleware } from "../middlewares/auth.js"

export const authRouter = new Hono()

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
  const token = await signJwt({
    sub: user.id,
    merchantId: merchantId,
    role: user.role,
    jti,
  })

  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 201)
})

authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json")

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, merchantId: true, passwordHash: true, deletedAt: true },
  })

  if (!user || user.deletedAt || user.passwordHash !== sha256(password)) {
    return c.json({ error: "Invalid credentials" }, 401)
  }

  const jti = nanoid()
  const token = await signJwt({
    sub: user.id,
    merchantId: user.merchantId ?? "",
    role: user.role,
    jti,
  })

  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
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

// DELETE /me — GDPR right to erasure
authRouter.delete("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth")
  await db.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), email: `deleted+${userId}@payflow.invalid`, name: null, passwordHash: null },
  })
  return c.json({ message: "Account deleted" })
})
