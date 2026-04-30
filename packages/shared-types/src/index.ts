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

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthResult = {
  token: string
  userId: string
  merchantId: string
  expiresAt: string
}
