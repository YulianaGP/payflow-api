import Stripe from "stripe"
import type {
  PaymentService,
  CheckoutInput,
  CheckoutResult,
  PaymentStatus,
  WebhookEvent,
  SubscriptionInput,
  SubscriptionResult,
  ExternalPayment,
} from "./types.js"

// Stripe status → our internal PaymentStatus
const STATUS_MAP: Record<string, PaymentStatus> = {
  succeeded:                "SUCCESS",
  payment_failed:           "FAILED",
  canceled:                 "FAILED",
  processing:               "PROCESSING",
  requires_payment_method:  "PENDING",
  requires_confirmation:    "PENDING",
  requires_action:          "PENDING",
  requires_capture:         "PROCESSING",
}

function getClient(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"]
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" })
}

function mapStatus(stripeStatus: string): PaymentStatus {
  return STATUS_MAP[stripeStatus] ?? "PENDING"
}

export class StripePaymentService implements PaymentService {
  // ── Checkout ────────────────────────────────────────────────────────────────

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const stripe = getClient()

    // Build line_items from items[] if provided, otherwise use a single product
    const lineItems = input.items?.length
      ? input.items.map((item) => ({
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: {
              name: item.name,
              ...(item.description !== undefined ? { description: item.description } : {}),
            },
            unit_amount: item.unitPrice,
          },
          quantity: item.quantity,
        }))
      : [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              product_data: { name: input.description },
              unit_amount: input.amount,
            },
            quantity: 1,
          },
        ]

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        customer_email: input.customerEmail,
        success_url: input.successUrl,
        cancel_url: input.failureUrl,
        // Store our orderId in metadata so we can correlate later
        metadata: { orderId: input.orderId, idempotencyKey: input.idempotencyKey },
      },
      { idempotencyKey: input.idempotencyKey }
    )

    return {
      redirectUrl: session.url!,
      externalRef: session.payment_intent as string,
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  async getPaymentStatus(externalRef: string): Promise<PaymentStatus> {
    const stripe = getClient()
    const intent = await stripe.paymentIntents.retrieve(externalRef)
    return mapStatus(intent.status)
  }

  // ── Webhook ─────────────────────────────────────────────────────────────────

  async parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent> {
    const stripe = getClient()
    const secret = process.env["STRIPE_WEBHOOK_SECRET"]
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set")

    const signature = headers["stripe-signature"]
    if (!signature) throw new Error("Missing stripe-signature header")

    // constructEvent verifies HMAC-SHA256 signature AND checks timestamp (±5 min)
    // — protects against replay attacks automatically
    const event = stripe.webhooks.constructEvent(
      body as string | Buffer,
      signature,
      secret
    )

    const intent = event.data.object as Stripe.PaymentIntent
    const status = mapStatus(intent.status)

    return {
      provider: "stripe",
      externalEventId: event.id,
      externalId: intent.id,
      eventType: event.type,
      status,
      amount: intent.amount,
      currency: intent.currency.toUpperCase() as any,
      rawPayload: event,
    }
  }

  // ── Refund ──────────────────────────────────────────────────────────────────

  async refund(externalRef: string, amount?: number): Promise<void> {
    const stripe = getClient()
    await stripe.refunds.create({
      payment_intent: externalRef,
      ...(amount !== undefined ? { amount } : {}),
    })
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  async createSubscription(input: SubscriptionInput): Promise<SubscriptionResult> {
    const stripe = getClient()

    const price = await stripe.prices.create({
      currency: input.currency.toLowerCase(),
      unit_amount: input.amount,
      recurring: { interval: input.interval },
    })

    const subscription = await stripe.subscriptions.create(
      {
        customer: input.customerId,
        items: [{ price: price.id }],
        ...(input.trialDays !== undefined ? { trial_period_days: input.trialDays } : {}),
        metadata: { planId: input.planId },
      },
      { idempotencyKey: input.idempotencyKey }
    )

    return { externalRef: subscription.id }
  }

  async cancelSubscription(externalRef: string): Promise<void> {
    const stripe = getClient()
    await stripe.subscriptions.cancel(externalRef)
  }

  // ── Idempotency lookup ───────────────────────────────────────────────────────

  async getByIdempotencyKey(key: string): Promise<ExternalPayment | null> {
    const stripe = getClient()

    // Search checkout sessions by idempotency key stored in metadata
    const sessions = await stripe.checkout.sessions.list({
      limit: 1,
    })

    const session = sessions.data.find(
      (s) => s.metadata?.idempotencyKey === key
    )
    if (!session || !session.payment_intent) return null

    const intent = await stripe.paymentIntents.retrieve(session.payment_intent as string)

    return {
      externalRef: intent.id,
      status: mapStatus(intent.status),
      amount: intent.amount,
      currency: intent.currency.toUpperCase() as any,
    }
  }
}
