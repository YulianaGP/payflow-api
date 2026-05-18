import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { db } from "../lib/db.js"
import { authMiddleware } from "../middlewares/auth.js"
import { createRateLimiter } from "../lib/rateLimiter.js"

export const invoicesRouter = new Hono()

const createSchema = z.object({
  amount: z.number().int().min(50),
  currency: z.enum(["ARS", "USD", "EUR", "MXN", "CLP", "COP", "PEN"]),
  description: z.string().min(1).max(500),
  expiresAt: z.string().datetime().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: z.number().int().min(1),
  })).optional(),
})

// All authenticated routes
invoicesRouter.use("/", authMiddleware)
invoicesRouter.use("/:id/pay", authMiddleware)

// GET /api/invoices — list merchant invoices
invoicesRouter.get("/", authMiddleware, async (c) => {
  const { merchantId } = c.get("auth")
  const invoices = await db.invoice.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return c.json(invoices)
})

// POST /api/invoices — create a pay-by-link invoice
invoicesRouter.post("/", authMiddleware, zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json")
  const { merchantId } = c.get("auth")

  const invoice = await db.invoice.create({
    data: {
      merchantId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      items: input.items as any ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  })

  const payUrl = `${process.env["WEB_URL"] ?? "http://localhost:3000"}/pay/${invoice.id}`
  return c.json({ ...invoice, payUrl }, 201)
})

// Rate limiter for the public GET — 20 req/min per IP (prevents enumeration/scraping)
const publicGetLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 })

// GET /api/invoices/:id — public endpoint (no auth) for the /pay/[id] page
invoicesRouter.get("/:id", publicGetLimiter, async (c) => {
  const { id } = c.req.param()

  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) return c.json({ error: "Invoice not found" }, 404)

  if (invoice.expiresAt && invoice.expiresAt < new Date()) {
    return c.json({ error: "Invoice has expired", code: "INVOICE_EXPIRED" }, 410)
  }

  // Never return merchantId to unauthenticated callers
  const { merchantId: _, ...safe } = invoice
  return c.json(safe)
})

// POST /api/invoices/:id/pay — create payment from invoice (authenticated merchant)
invoicesRouter.post("/:id/pay", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")

  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice || invoice.merchantId !== merchantId) return c.json({ error: "Invoice not found" }, 404)
  if (invoice.status !== "pending") return c.json({ error: "Invoice already paid or expired", code: "INVOICE_NOT_PAYABLE" }, 409)
  if (invoice.expiresAt && invoice.expiresAt < new Date()) {
    await db.invoice.update({ where: { id }, data: { status: "expired" } })
    return c.json({ error: "Invoice has expired", code: "INVOICE_EXPIRED" }, 410)
  }

  // Mark as paid — actual payment creation happens via the regular POST /api/payments flow
  await db.invoice.update({ where: { id }, data: { status: "paid" } })
  return c.json({ paid: true })
})
