// Payment status — internal representation, provider-agnostic
export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED"

export type Currency = "ARS" | "USD" | "EUR" | "MXN" | "CLP" | "COP"

export type PaymentProvider = "mercadopago" | "stripe" | "mock"

export interface OrderItem {
  name: string
  description?: string
  quantity: number
  unitPrice: number // in cents
}

// Input to create a checkout session — neutral terms, no provider leakage
export interface CheckoutInput {
  orderId: string
  amount: number // in cents — validated: min 50, max 99_999_999
  currency: Currency
  description: string
  customerEmail: string
  successUrl: string
  failureUrl: string
  idempotencyKey: string
  items?: OrderItem[] // optional — for multi-item orders [F1]
}

export interface CheckoutResult {
  redirectUrl: string // where to send the user to complete payment
  externalRef: string // provider's reference ID (neutral name, not "preferenceId")
}

// Webhook event — normalized across providers
export interface WebhookEvent {
  provider: PaymentProvider
  externalId: string     // provider's payment ID
  eventType: string      // e.g. 'payment.approved', 'payment.rejected'
  status: PaymentStatus
  amount: number         // confirmed amount in cents (must match original)
  currency: Currency     // confirmed currency (must match original)
  raw: unknown           // original payload for debugging
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

// Cash payment voucher — for OXXO (Mexico), Rapipago/PagoFacil (Argentina) [F2]
export interface CashVoucherResult {
  voucherCode: string
  instructions: string
  expiresAt: Date
  networkName: string // 'OXXO' | 'Rapipago' | 'PagoFacil'
}

// Core interface — every provider implements this
// Terms are neutral: no "preferenceId" (MP), no "sessionId" (Stripe)
export interface PaymentService {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>
  getPaymentStatus(externalRef: string): Promise<PaymentStatus>
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent>
  refund(externalRef: string, amount?: number): Promise<void>
  createSubscription(input: SubscriptionInput): Promise<SubscriptionResult>
  cancelSubscription(externalRef: string): Promise<void>
  getByIdempotencyKey(key: string): Promise<ExternalPayment | null>
  createCashVoucher?(input: CheckoutInput): Promise<CashVoucherResult> // optional [F2]
}
