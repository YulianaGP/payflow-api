import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { db } from "../lib/db.js"
import { authMiddleware, requireAdmin } from "../middlewares/auth.js"
import { generateTotpSecret, generateTotpUri, verifyTotpCode, encryptSecret, decryptSecret } from "../lib/totp.js"
import { verifyJwt } from "../lib/jwt.js"

export const twofaRouter = new Hono()

twofaRouter.use("*", authMiddleware)
twofaRouter.use("*", requireAdmin)

// Step 1: admin requests setup — returns a QR URI to scan with Google Authenticator
twofaRouter.post("/setup", async (c) => {
  const { userId } = c.get("auth")

  const existing = await db.twoFactorAuth.findUnique({ where: { userId } })
  if (existing) return c.json({ error: "2FA already enabled" }, 409)

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) return c.json({ error: "User not found" }, 404)

  const secret = generateTotpSecret()
  const uri = generateTotpUri(secret, user.email)

  // Secret is returned temporarily — NOT saved until admin confirms with a valid code
  return c.json({ secret, uri, message: "Scan the QR code with Google Authenticator, then POST /2fa/confirm" })
})

// Step 2: admin enters the 6-digit code to confirm setup worked
twofaRouter.post(
  "/confirm",
  zValidator("json", z.object({ secret: z.string(), code: z.string().length(6) })),
  async (c) => {
    const { userId } = c.get("auth")
    const { secret, code } = c.req.valid("json")

    if (!verifyTotpCode(secret, code)) {
      return c.json({ error: "Invalid TOTP code — try again" }, 400)
    }

    await db.twoFactorAuth.create({
      data: { userId, encryptedSecret: encryptSecret(secret) },
    })

    return c.json({ message: "2FA enabled successfully" })
  }
)

// Called after password login to verify the 6-digit code from the phone
twofaRouter.post(
  "/verify",
  zValidator("json", z.object({ code: z.string().length(6) })),
  async (c) => {
    const { userId } = c.get("auth")
    const { code } = c.req.valid("json")

    const twofa = await db.twoFactorAuth.findUnique({ where: { userId } })
    if (!twofa) return c.json({ error: "2FA not enabled for this account" }, 400)

    const secret = decryptSecret(twofa.encryptedSecret)
    if (!verifyTotpCode(secret, code)) {
      return c.json({ error: "Invalid TOTP code" }, 401)
    }

    return c.json({ message: "2FA verified" })
  }
)

// Disable 2FA
twofaRouter.delete("/", async (c) => {
  const { userId } = c.get("auth")
  await db.twoFactorAuth.deleteMany({ where: { userId } })
  return c.json({ message: "2FA disabled" })
})

// Panic button — compromised account: invalidates all active sessions immediately
twofaRouter.post("/revoke-all-sessions", async (c) => {
  const { userId } = c.get("auth")
  const header = c.req.header("Authorization")!
  const currentToken = header.slice(7)

  const payload = await verifyJwt(currentToken)
  const expiresAt = new Date((payload as unknown as { exp: number }).exp * 1000)

  await db.revokedSession.upsert({
    where: { jti: payload.jti },
    create: { jti: payload.jti, userId, expiresAt },
    update: {},
  })

  return c.json({ message: "All sessions revoked. Please log in again." })
})
