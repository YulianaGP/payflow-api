import { nanoid } from "nanoid"
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

// In-memory store — only for dev/test, never production
const store = new Map<string, { status: PaymentStatus; amount: number; currency: string }>()

type MockBehavior = "success" | "fail" | "pending" | "timeout"

function getBehavior(): MockBehavior {
  const b = process.env["MOCK_PAYMENT_BEHAVIOR"] ?? "success"
  return ["success", "fail", "pending", "timeout"].includes(b) ? (b as MockBehavior) : "success"
}

export class MockPaymentService implements PaymentService {
  constructor() {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("MockPaymentService cannot be used in production")
    }
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const externalRef = `mock_${nanoid()}`
    const behavior = getBehavior()
    const status: PaymentStatus = behavior === "success"
      ? "SUCCESS"
      : behavior === "fail"
      ? "FAILED"
      : "PENDING"

    store.set(externalRef, { status, amount: input.amount, currency: input.currency })

    // Simulate the redirect URL — in real providers this is their hosted checkout page
    const redirectUrl = `http://localhost:3000/mock-checkout/${externalRef}`
    return { redirectUrl, externalRef }
  }

  async getPaymentStatus(externalRef: string): Promise<PaymentStatus> {
    return store.get(externalRef)?.status ?? "PENDING"
  }

  async parseWebhook(body: unknown, _headers: Record<string, string>): Promise<WebhookEvent> {
    const payload = body as { externalRef: string; status: PaymentStatus; amount?: number; currency?: string }

    const stored = store.get(payload.externalRef)

    // Allow body to override stored values — useful when server restarted (in-memory store cleared)
    const status = payload.status ?? stored?.status
    const amount = stored?.amount ?? payload.amount ?? 0
    const currency = stored?.currency ?? payload.currency ?? "USD"

    if (!status) throw new Error(`Mock: unknown externalRef ${payload.externalRef} and no status provided`)

    return {
      provider: "mock",
      externalEventId: `mock_evt_${nanoid()}`,
      externalId: payload.externalRef,
      eventType: "payment.updated",
      status,
      amount,
      currency: currency as any,
      rawPayload: body,
    }
  }

  async refund(externalRef: string, _amount?: number): Promise<void> {
    const entry = store.get(externalRef)
    if (entry) entry.status = "REFUNDED"
  }

  async createSubscription(_input: SubscriptionInput): Promise<SubscriptionResult> {
    return { externalRef: `mock_sub_${nanoid()}` }
  }

  async cancelSubscription(externalRef: string): Promise<void> {
    store.delete(externalRef)
  }

  async getByIdempotencyKey(key: string): Promise<ExternalPayment | null> {
    for (const [externalRef, data] of store.entries()) {
      if (externalRef.includes(key)) {
        return { externalRef, status: data.status, amount: data.amount, currency: data.currency as any }
      }
    }
    return null
  }
}
