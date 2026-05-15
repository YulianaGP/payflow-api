import { Hono } from "hono"
import { MockPaymentService, StripePaymentService, MercadoPagoPaymentService } from "@payflow/payment-providers"
import { processPaymentUpdate } from "../services/paymentProcessor.js"

export const webhooksRouter = new Hono()

// POST /api/webhooks/mock — receives simulated webhook events
webhooksRouter.post("/mock", async (c) => {
  const body = await c.req.json()

  try {
    const provider = new MockPaymentService()
    const event = await provider.parseWebhook(body, Object.fromEntries(c.req.raw.headers))
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("Webhook processing error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

// POST /api/webhooks/stripe — real Stripe webhook events
// Stripe requires the raw body string for HMAC signature verification.
webhooksRouter.post("/stripe", async (c) => {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"] ?? ""
  const isTestPlaceholder = !secret || secret === "whsec_test_placeholder"

  try {
    const provider = new StripePaymentService()
    // In production: pass raw body so Stripe can verify the HMAC signature.
    // In test/dev (placeholder secret): parse as JSON — verification is skipped inside the adapter.
    const body = isTestPlaceholder ? await c.req.json() : await c.req.raw.text()
    const headers = Object.fromEntries(c.req.raw.headers)

    const event = await provider.parseWebhook(body, headers)
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("Stripe webhook error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

// POST /api/webhooks/mercadopago — real MercadoPago webhook events
webhooksRouter.post("/mercadopago", async (c) => {
  const body = await c.req.json()

  try {
    const provider = new MercadoPagoPaymentService()
    const event = await provider.parseWebhook(body, Object.fromEntries(c.req.raw.headers))
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("MercadoPago webhook error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})
