import { Hono } from "hono"
import { nanoid } from "nanoid"
import { MockPaymentService, StripePaymentService, MercadoPagoPaymentService } from "@payflow/payment-providers"
import { processPaymentUpdate } from "../services/paymentProcessor.js"
import { processDisputeEvent } from "../services/disputeService.js"

export const webhooksRouter = new Hono()

// POST /api/webhooks/mock — simulated webhook events (payment updates + disputes)
webhooksRouter.post("/mock", async (c) => {
  const body = await c.req.json()

  try {
    // Dispute simulation: send { eventType: 'dispute.created', externalRef: 'mock_xxx', reason: 'fraudulent' }
    if (typeof body.eventType === "string" && body.eventType.startsWith("dispute.")) {
      const status = body.status ?? "needs_response"
      const result = await processDisputeEvent({
        provider: "mock",
        externalEventId: `mock_devt_${nanoid(8)}`,
        paymentExternalId: body.externalRef,
        disputeExternalId: `mock_disp_${nanoid(8)}`,
        status,
        reason: body.reason ?? "fraudulent",
        amount: body.amount ?? 0,
        currency: body.currency ?? "USD",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        rawPayload: body,
      })
      return c.json({ received: true, processed: result.processed, reason: result.reason })
    }

    const provider = new MockPaymentService()
    const event = await provider.parseWebhook(body, Object.fromEntries(c.req.raw.headers))
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("Webhook processing error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

// POST /api/webhooks/stripe — real Stripe webhook events (payments + disputes)
// Stripe requires the raw body string for HMAC signature verification.
webhooksRouter.post("/stripe", async (c) => {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"] ?? ""
  const isTestPlaceholder = !secret || secret === "whsec_test_placeholder"

  try {
    const provider = new StripePaymentService()
    const rawBody = isTestPlaceholder ? JSON.stringify(await c.req.json()) : await c.req.raw.text()
    const headers = Object.fromEntries(c.req.raw.headers)
    const parsed = JSON.parse(rawBody)

    // Dispute events use a different flow — don't go through parseWebhook
    if (typeof parsed.type === "string" && parsed.type.startsWith("charge.dispute.")) {
      const d = parsed.data?.object ?? {}
      const status = mapStripeDisputeStatus(d.status ?? "needs_response")
      const result = await processDisputeEvent({
        provider: "stripe",
        externalEventId: parsed.id ?? `stripe_${nanoid(8)}`,
        paymentExternalId: d.payment_intent ?? d.charge ?? "",
        disputeExternalId: d.id ?? "",
        status,
        reason: d.reason ?? "unknown",
        amount: d.amount ?? 0,
        currency: (d.currency ?? "usd").toUpperCase(),
        dueDate: d.evidence_details?.due_by
          ? new Date(d.evidence_details.due_by * 1000)
          : null,
        rawPayload: parsed,
      })
      return c.json({ received: true, processed: result.processed, reason: result.reason })
    }

    const event = await provider.parseWebhook(rawBody, headers)
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("Stripe webhook error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

// POST /api/webhooks/mercadopago — real MercadoPago webhook events (payments + chargebacks)
webhooksRouter.post("/mercadopago", async (c) => {
  const body = await c.req.json()

  try {
    // MercadoPago sends chargebacks as topic=chargebacks or type=chargebacks
    if (body.topic === "chargebacks" || body.type === "chargebacks") {
      const chargebackId = body.data?.id ?? body.id ?? `mp_chargeback_${nanoid(8)}`
      const paymentId = body.data?.payment_id ?? body.payment_id ?? ""
      const result = await processDisputeEvent({
        provider: "mercadopago",
        externalEventId: chargebackId,
        paymentExternalId: paymentId,
        disputeExternalId: chargebackId,
        status: "needs_response",
        reason: "charged_back",
        amount: 0,  // MP chargeback notification doesn't include amount — fetched via API in production
        currency: "ARS",
        dueDate: null,
        rawPayload: body,
      })
      return c.json({ received: true, processed: result.processed, reason: result.reason })
    }

    const provider = new MercadoPagoPaymentService()
    const event = await provider.parseWebhook(body, Object.fromEntries(c.req.raw.headers))
    const result = await processPaymentUpdate(event, "webhook")
    return c.json({ received: true, processed: result.processed, reason: result.reason })
  } catch (err) {
    console.error("MercadoPago webhook error:", err)
    return c.json({ received: true, processed: false, reason: "internal_error" })
  }
})

function mapStripeDisputeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    warning_needs_response: "needs_response",
    warning_under_review:   "under_review",
    warning_closed:         "lost",
    needs_response:         "needs_response",
    under_review:           "under_review",
    charge_refunded:        "won",
    won:                    "won",
    lost:                   "lost",
  }
  return map[stripeStatus] ?? "open"
}
