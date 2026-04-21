import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { nanoid } from "nanoid"
import { db } from "../lib/db.js"
import { sha256 } from "../lib/crypto.js"
import { authMiddleware } from "../middlewares/auth.js"

export const keysRouter = new Hono()

keysRouter.use("*", authMiddleware)

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.enum(["live", "test"]).default("test"),
})

// POST /api/keys — create new API key (shown only once)
keysRouter.post("/", zValidator("json", createKeySchema), async (c) => {
  const { userId } = c.get("auth")
  const { name, mode } = c.req.valid("json")

  const prefix = mode === "live" ? "pk_live_" : "pk_test_"
  const rawKey = `${prefix}${nanoid(32)}`
  const keyHash = sha256(rawKey)

  const apiKey = await db.apiKey.create({
    data: { userId, keyHash, prefix, name },
  })

  // rawKey shown only once — not stored
  return c.json({ id: apiKey.id, name: apiKey.name, key: rawKey, prefix, createdAt: apiKey.createdAt }, 201)
})

// GET /api/keys — list keys (no raw values)
keysRouter.get("/", async (c) => {
  const { userId } = c.get("auth")

  const keys = await db.apiKey.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return c.json(keys)
})

// DELETE /api/keys/:id — revoke key
keysRouter.delete("/:id", async (c) => {
  const { userId } = c.get("auth")
  const { id } = c.req.param()

  const key = await db.apiKey.findFirst({ where: { id, userId } })
  if (!key) return c.json({ error: "API key not found" }, 404)
  if (key.revokedAt) return c.json({ error: "API key already revoked" }, 409)

  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })

  return c.json({ message: "API key revoked" })
})
