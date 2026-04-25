import { Hono } from "hono"
import { MockPaymentService } from "@payflow/payment-providers"
import { processPaymentUpdate } from "../services/paymentProcessor.js"

export const webhooksRouter = new Hono()

// POST /api/webhooks/mock — receives simulated webhook events
// In production: POST /api/webhooks/mercadopago and /api/webhooks/stripe
webhooksRouter.post("/mock", async (c) => {
  const body = await c.req.json()

  try {
    const provider = new MockPaymentService()
    const event = await provider.parseWebhook(body, Object.fromEntries(c.req.raw.headers))
    const result = await processPaymentUpdate(event, "webhook")

    // CRITICAL: always return 200 — never 4xx/5xx
    // If we return an error code, the provider retries forever
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    // Log but still return 200 — we don't want infinite retries
    console.error("Webhook processing error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

// Placeholder routes for real providers — implemented in Steps 6 & 7
webhooksRouter.post("/mercadopago", async (c) => {
  return c.json({ received: true, message: "MercadoPago adapter not yet implemented" })
})

webhooksRouter.post("/stripe", async (c) => {
  return c.json({ received: true, message: "Stripe adapter not yet implemented" })
})
