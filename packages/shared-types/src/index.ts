// Flat DTOs — what the API surface exposes to the frontend.
// Rule: no imports from Prisma, Zod, or any external library.
// These types mirror the select shapes in route handlers, not the full DB model.

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED"

export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED"

export type TransactionStatus = "COMPLETED" | "FAILED" | "REVERSED"

export type TransactionType = "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "REFUND"

export type Currency = "USD" | "ARS" | "EUR" | "MXN" | "CLP" | "COP"

// ─── Payment ──────────────────────────────────────────────────────────────────

export type PaymentDTO = {
  id: string
  orderId: string
  amount: number      // always in cents
  currency: string
  status: PaymentStatus
  provider: string
  createdAt: string   // ISO 8601 string — never a Date object
}

export type CreatePaymentResult = {
  id: string
  redirectUrl: string
  status: PaymentStatus
}

// ─── Account ─────────────────────────────────────────────────────────────────

export type AccountDTO = {
  id: string
  name: string
  currency: string
  balance: number     // always in cents, never negative
  status: AccountStatus
  createdAt: string
  updatedAt: string
}

export type AccountListResult = {
  data: AccountDTO[]
  nextCursor: string | null
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export type LedgerEntryDTO = {
  id: string
  transactionId: string
  accountId: string
  type: "debit" | "credit"
  amount: number      // positive = credit, negative = debit. In cents.
  currency: string
  balanceAfter: number
  createdAt: string
}

export type TransactionDTO = {
  id: string
  merchantId: string
  debitAccountId: string | null
  creditAccountId: string | null
  type: TransactionType
  status: TransactionStatus
  amount: number
  currency: string
  description: string | null
  idempotencyKey: string | null
  createdBy: string
  reversalOfId: string | null
  createdAt: string
  updatedAt: string
  ledgerEntries: LedgerEntryDTO[]
}

export type TransactionListResult = {
  data: TransactionDTO[]
  nextCursor: string | null
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "PAUSED"

export type PlanDTO = {
  id: string
  merchantId: string
  name: string
  description: string | null
  price: number       // in cents
  currency: string
  interval: string
  intervalCount: number
  trialDays: number
  isActive: boolean
  createdAt: string
}

export type SubscriptionDTO = {
  id: string
  merchantId: string
  userId: string
  planId: string
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  unitPrice: number   // price snapshot at subscription time
  currency: string
  creditBalance: number
  provider: string
  externalId: string | null
  createdAt: string
  updatedAt: string
  plan: { name: string; interval: string; intervalCount: number }
}

export type PlanChangePreviewDTO = {
  currentPlan: { id: string; name: string; price: number }
  newPlan: { id: string; name: string; price: number }
  daysRemaining: number
  daysInPeriod: number
  creditCents: number
  chargeCents: number
  creditBalanceCents: number
  netChargeCents: number
  appliedNextPeriod: boolean
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthResult = {
  token: string
  expiresAt: string
  user: {
    id: string
    email: string
    name: string | null
    role: string
    merchantId: string
  }
}
