import { z } from "zod"

// ── Enums ────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED"

export type Currency = "ARS" | "USD" | "EUR" | "MXN" | "CLP" | "COP" | "PEN"

export type PaymentProvider = "mercadopago" | "stripe" | "mock"

// ── Zod validation ───────────────────────────────────────────────────────────
// Amounts always in cents (integers). $10.50 = 1050. Never floats.

export const CheckoutSchema = z.object({
  orderId: z.string().min(1),
  amount: z
    .number()
    .int("Amount must be an integer (cents)")
    .min(50, "Minimum amount: 50 cents")
    .max(99_999_999, "Maximum amount: $999,999.99"),
  currency: z.enum(["ARS", "USD", "EUR", "MXN", "CLP", "COP", "PEN"]),
  description: z.string().min(1).max(500),
  customerEmail: z.string().email(),
  successUrl: z.string().url(),
  failureUrl: z.string().url(),
  idempotencyKey: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        quantity: z.number().int().min(1),
        unitPrice: z.number().int().min(1),
      })
    )
    .optional(),
})

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface OrderItem {
  name: string
  description?: string
  quantity: number
  unitPrice: number // in cents
}

export interface CheckoutInput extends z.infer<typeof CheckoutSchema> {}

export interface CheckoutResult {
  redirectUrl: string // where to send the user to complete payment
  externalRef: string // provider's payment ID (neutral name, not "preferenceId")
}

// Webhook event — normalized across providers
export interface WebhookEvent {
  provider: PaymentProvider
  externalEventId: string  // provider's unique event ID — used for idempotency
  externalId: string       // provider's payment/charge ID
  eventType: string        // e.g. 'payment.approved', 'payment.rejected'
  status: PaymentStatus
  amount: number           // confirmed amount in cents (must match original)
  currency: Currency       // confirmed currency (must match original)
  rawPayload: unknown      // original payload — stored for debugging
}

export interface SubscriptionInput {
  customerId: string
  planId: string
  amount: number
  currency: Currency
  interval: "month" | "year"
  trialDays?: number
  idempotencyKey: string
}

export interface SubscriptionResult {
  externalRef: string
}

export interface ExternalPayment {
  externalRef: string
  status: PaymentStatus
  amount: number
  currency: Currency
}

export interface CashVoucherResult {
  voucherCode: string
  instructions: string
  expiresAt: Date
  networkName: string // 'OXXO' | 'Rapipago' | 'PagoFacil'
}

// Core interface — every provider must implement this
export interface PaymentService {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>
  getPaymentStatus(externalRef: string): Promise<PaymentStatus>
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent>
  refund(externalRef: string, amount?: number): Promise<void>
  createSubscription(input: SubscriptionInput): Promise<SubscriptionResult>
  cancelSubscription(externalRef: string): Promise<void>
  getByIdempotencyKey(key: string): Promise<ExternalPayment | null>
  createCashVoucher?(input: CheckoutInput): Promise<CashVoucherResult>
}
