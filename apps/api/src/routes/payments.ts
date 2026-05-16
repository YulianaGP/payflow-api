import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { nanoid } from "nanoid"
import { CheckoutSchema } from "@payflow/payment-providers"
import { db } from "../lib/db.js"
import { authMiddleware } from "../middlewares/auth.js"
import { resolveProvider } from "../services/providerResolver.js"
import { paymentEventBus } from "../lib/paymentEvents.js"
import type { PaymentStreamEvent } from "../lib/paymentEvents.js"
import { ServiceUnavailableError } from "../lib/errors.js"

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
      // customerEmail stored in metadata — used by outbox worker to send confirmation emails
      metadata: { customerEmail: input.customerEmail, description: input.description },
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

// GET /api/payments/stream — SSE real-time payment updates
// Three required protections: heartbeat (25s), connection limit (100), cleanup on abort
let activeSSEConnections = 0
const MAX_SSE_CONNECTIONS = 100

paymentsRouter.get("/stream", async (c) => {
  if (activeSSEConnections >= MAX_SSE_CONNECTIONS) {
    return c.json({ error: "Too many connections", code: "SERVICE_UNAVAILABLE" }, 503)
  }

  const { merchantId, role } = c.get("auth")
  activeSSEConnections++

  return streamSSE(c, async (stream) => {
    // Send initial comment immediately — forces Next.js proxy to flush headers to the browser
    // Without this, the proxy buffers the response until the first real data arrives (up to 25s)
    await stream.writeSSE({ data: "", event: "connected" })

    // Heartbeat prevents proxies (nginx, Vercel, Cloudflare) from killing idle connections
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: "", event: "ping" })
      } catch {
        // stream already closed — clearInterval will run in onAbort
      }
    }, 25_000)

    const listener = async (event: PaymentStreamEvent) => {
      // Admin sees all merchants; regular users see only their own payments
      if (role !== "ADMIN" && event.merchantId !== merchantId) return
      try {
        await stream.writeSSE({ data: JSON.stringify(event), event: "payment_updated" })
      } catch {
        // stream already closed
      }
    }

    paymentEventBus.on("payment_updated", listener)

    // Keep the handler alive until the client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat)
        paymentEventBus.off("payment_updated", listener)
        activeSSEConnections--
        resolve()
      })
    })
  })
})

// GET /api/payments/:id/receipt — printable HTML receipt (user can print to PDF)
paymentsRouter.get("/:id/receipt", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")

  const payment = await db.payment.findFirst({
    where: { id, merchantId },
    include: { merchant: { select: { name: true } } },
  })
  if (!payment) return c.json({ error: "Payment not found" }, 404)

  const meta = payment.metadata as { customerEmail?: string; description?: string } | null
  const amount = (payment.amount / 100).toFixed(2)
  const date = payment.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt — ${payment.id}</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .badge { display:inline-block; padding:2px 10px; border-radius:9999px; font-size:.75rem; font-weight:600;
             background:${payment.status === "SUCCESS" ? "#dcfce7" : "#fee2e2"};
             color:${payment.status === "SUCCESS" ? "#166534" : "#991b1b"}; margin-bottom:24px; }
    table { width:100%; border-collapse:collapse; margin-top:16px; }
    td { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    td:first-child { color:#6b7280; width:40%; }
    td:last-child { font-weight:500; }
    .footer { margin-top:32px; font-size:.8rem; color:#9ca3af; text-align:center; }
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  <h1>PayFlow</h1>
  <div class="badge">${payment.status}</div>
  <table>
    <tr><td>Transaction ID</td><td>${payment.id}</td></tr>
    <tr><td>Date</td><td>${date}</td></tr>
    <tr><td>Amount</td><td>${amount} ${payment.currency}</td></tr>
    <tr><td>Provider</td><td>${payment.provider}</td></tr>
    <tr><td>Order ID</td><td>${payment.orderId}</td></tr>
    ${meta?.description ? `<tr><td>Description</td><td>${meta.description}</td></tr>` : ""}
    ${meta?.customerEmail ? `<tr><td>Customer</td><td>${meta.customerEmail}</td></tr>` : ""}
    <tr><td>Merchant</td><td>${(payment as any).merchant?.name ?? merchantId}</td></tr>
  </table>
  <div class="footer">Generated by PayFlow — ${new Date().toISOString()}</div>
  <p class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:8px 20px;cursor:pointer">Print / Save as PDF</button>
  </p>
</body>
</html>`

  c.header("Content-Type", "text/html; charset=utf-8")
  c.header("Content-Disposition", `inline; filename="receipt-${id}.html"`)
  return c.body(html)
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
  const orderId = c.req.query("orderId")
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100)

  const payments = await db.payment.findMany({
    where: {
      merchantId,
      ...(orderId ? { orderId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, orderId: true, status: true, amount: true, currency: true, provider: true, createdAt: true },
  })

  return c.json(payments)
})

