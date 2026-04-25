import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { nanoid } from "nanoid"
import { CheckoutSchema, MockPaymentService } from "@payflow/payment-providers"
import { db } from "../lib/db.js"
import { authMiddleware } from "../middlewares/auth.js"

export const paymentsRouter = new Hono()

paymentsRouter.use("*", authMiddleware)

// POST /api/payments — create a payment and get the checkout URL
paymentsRouter.post("/", zValidator("json", CheckoutSchema), async (c) => {
  const input = c.req.valid("json")
  const { merchantId } = c.get("auth")

  // Guard: prevent double-charge — if this orderId already has a SUCCESS, reject
  const existing = await db.payment.findUnique({
    where: { merchantId_orderId: { merchantId, orderId: input.orderId } },
  })
  if (existing?.status === "SUCCESS") {
    return c.json({ error: "This order has already been paid" }, 409)
  }

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } })
  if (!merchant) return c.json({ error: "Merchant not found" }, 404)

  // Select provider based on payment.provider (not merchant — per ChatGPT feedback)
  const providerName = merchant.paymentProvider as "mercadopago" | "stripe" | "mock"
  const provider = resolveProvider(providerName)

  const idempotencyKey = input.idempotencyKey ?? nanoid()

  // Check if provider already has a payment for this idempotency key
  const existingExternal = await provider.getByIdempotencyKey(idempotencyKey)
  if (existingExternal) {
    return c.json({ externalRef: existingExternal.externalRef, status: existingExternal.status })
  }

  const result = await provider.createCheckout({ ...input, idempotencyKey })

  // Store payment with provider baked in — source of truth for routing
  const payment = await db.payment.create({
    data: {
      merchantId,
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency,
      provider: providerName,
      externalId: result.externalRef,
      idempotencyKey,
      items: input.items as any,
    },
  })

  await db.paymentAuditLog.create({
    data: {
      paymentId: payment.id,
      fromStatus: "PENDING",
      toStatus: "PENDING",
      changedBy: "system",
      metadata: { action: "payment_created", provider: providerName },
    },
  })

  return c.json({ id: payment.id, redirectUrl: result.redirectUrl, status: payment.status }, 201)
})

// GET /api/payments/:id — get payment status
paymentsRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")

  const payment = await db.payment.findFirst({
    where: { id, merchantId },
    select: { id: true, orderId: true, status: true, amount: true, currency: true, provider: true, createdAt: true },
  })

  if (!payment) return c.json({ error: "Payment not found" }, 404)
  return c.json(payment)
})

// GET /api/payments — list payments with basic filters
paymentsRouter.get("/", async (c) => {
  const { merchantId } = c.get("auth")
  const status = c.req.query("status")
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100)

  const payments = await db.payment.findMany({
    where: { merchantId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, orderId: true, status: true, amount: true, currency: true, provider: true, createdAt: true },
  })

  return c.json(payments)
})

// ── Provider resolver ─────────────────────────────────────────────────────────
function resolveProvider(name: "mercadopago" | "stripe" | "mock") {
  // In development, PAYMENT_PROVIDER=mock overrides the merchant's provider
  const override = process.env["PAYMENT_PROVIDER"]
  if (override === "mock" || name === "mock") return new MockPaymentService()
  // MercadoPago and Stripe adapters added in Steps 6 & 7
  throw new Error(`Provider '${name}' not yet implemented`)
}
