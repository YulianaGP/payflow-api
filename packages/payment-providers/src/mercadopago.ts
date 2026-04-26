import { MercadoPagoConfig, Preference, Payment, PreApproval } from "mercadopago"
import { createHmac, timingSafeEqual } from "crypto"
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

// MercadoPago status → our internal PaymentStatus
const STATUS_MAP: Record<string, PaymentStatus> = {
  approved:     "SUCCESS",
  rejected:     "FAILED",
  cancelled:    "FAILED",
  pending:      "PENDING",
  in_process:   "PROCESSING",
  authorized:   "PROCESSING",
  refunded:     "REFUNDED",
  charged_back: "DISPUTED",
}

function getClient(): MercadoPagoConfig {
  const token = process.env["MP_ACCESS_TOKEN"]
  if (!token) throw new Error("MP_ACCESS_TOKEN is not set")
  return new MercadoPagoConfig({ accessToken: token })
}

function mapStatus(mpStatus: string | undefined | null): PaymentStatus {
  if (!mpStatus) return "PENDING"
  return STATUS_MAP[mpStatus] ?? "PENDING"
}

// Verifies the x-signature header from MercadoPago webhooks.
// Format: "ts=<timestamp>,v1=<hmac>"
// Signed string: "id:<dataId>;request-id:<requestId>;ts:<timestamp>;"
function verifySignature(
  secret: string,
  headers: Record<string, string>,
  dataId: string
): void {
  const xSignature = headers["x-signature"]
  const xRequestId = headers["x-request-id"]
  if (!xSignature || !xRequestId) throw new Error("Missing MP signature headers")

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => part.split("=") as [string, string])
  )
  const ts = parts["ts"]
  const v1 = parts["v1"]
  if (!ts || !v1) throw new Error("Malformed x-signature header")

  // Reject webhooks older than 5 minutes — replay attack protection
  const age = Date.now() / 1000 - Number(ts)
  if (age > 300) throw new Error("Webhook expired — possible replay attack")

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest("hex")

  // timingSafeEqual prevents timing attacks
  const expectedBuf = Buffer.from(expected)
  const receivedBuf = Buffer.from(v1)
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    throw new Error("Invalid webhook signature")
  }
}

export class MercadoPagoPaymentService implements PaymentService {
  // ── Checkout ────────────────────────────────────────────────────────────────

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const client = getClient()
    const preference = new Preference(client)

    const items = input.items?.length
      ? input.items.map((item) => ({
          title: item.name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice / 100, // MP uses decimal, not cents
          currency_id: input.currency,
        }))
      : [
          {
            title: input.description,
            quantity: 1,
            unit_price: input.amount / 100,
            currency_id: input.currency,
          },
        ]

    const result = await preference.create({
      body: {
        items,
        payer: { email: input.customerEmail },
        back_urls: {
          success: input.successUrl,
          failure: input.failureUrl,
          pending: input.successUrl,
        },
        auto_return: "approved",
        external_reference: input.orderId,
        // notification_url is set globally via MP dashboard or per-request
      },
      requestOptions: { idempotencyKey: input.idempotencyKey },
    })

    return {
      redirectUrl: result.init_point!,
      externalRef: result.id!,
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  async getPaymentStatus(externalRef: string): Promise<PaymentStatus> {
    const client = getClient()
    const payment = new Payment(client)
    const result = await payment.get({ id: Number(externalRef) })
    return mapStatus(result.status)
  }

  // ── Webhook ─────────────────────────────────────────────────────────────────

  async parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent> {
    const secret = process.env["MP_WEBHOOK_SECRET"]
    if (!secret) throw new Error("MP_WEBHOOK_SECRET is not set")

    const payload = body as { action: string; data: { id: string }; id?: string }
    const dataId = payload.data?.id
    if (!dataId) throw new Error("Missing data.id in MP webhook")

    verifySignature(secret, headers, dataId)

    // Never trust the webhook body status — always fetch the real state from MP
    const client = getClient()
    const payment = new Payment(client)
    const result = await payment.get({ id: Number(dataId) })

    return {
      provider: "mercadopago",
      externalEventId: payload.id ?? `mp_${dataId}_${Date.now()}`,
      externalId: String(result.id),
      eventType: payload.action,
      status: mapStatus(result.status),
      amount: Math.round((result.transaction_amount ?? 0) * 100), // back to cents
      currency: (result.currency_id ?? "ARS") as any,
      rawPayload: body,
    }
  }

  // ── Refund ──────────────────────────────────────────────────────────────────

  async refund(externalRef: string, amount?: number): Promise<void> {
    const client = getClient()
    const payment = new Payment(client)
    await payment.refund({
      id: Number(externalRef),
      ...(amount !== undefined ? { body: { amount: amount / 100 } } : {}),
    })
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  async createSubscription(input: SubscriptionInput): Promise<SubscriptionResult> {
    const client = getClient()
    const preApproval = new PreApproval(client)

    const result = await preApproval.create({
      body: {
        payer_email: input.customerId, // MP uses email as customer identifier
        auto_recurring: {
          frequency: 1,
          frequency_type: input.interval === "month" ? "months" : "years",
          transaction_amount: input.amount / 100,
          currency_id: input.currency,
          free_trial: input.trialDays
            ? { frequency: input.trialDays, frequency_type: "days" }
            : undefined,
        },
        back_url: process.env["NEXTAUTH_URL"] ?? "http://localhost:3000",
        reason: `Plan ${input.planId}`,
        external_reference: input.planId,
      },
      requestOptions: { idempotencyKey: input.idempotencyKey },
    })

    return { externalRef: result.id! }
  }

  async cancelSubscription(externalRef: string): Promise<void> {
    const client = getClient()
    const preApproval = new PreApproval(client)
    await preApproval.update({
      id: externalRef,
      body: { status: "cancelled" },
    })
  }

  // ── Idempotency lookup ───────────────────────────────────────────────────────

  async getByIdempotencyKey(key: string): Promise<ExternalPayment | null> {
    const client = getClient()
    const payment = new Payment(client)

    const results = await payment.search({
      options: { criteria: "desc", limit: 1, external_reference: key },
    })

    const item = results.results?.[0]
    if (!item) return null

    return {
      externalRef: String(item.id),
      status: mapStatus(item.status),
      amount: Math.round((item.transaction_amount ?? 0) * 100),
      currency: (item.currency_id ?? "ARS") as any,
    }
  }
}
