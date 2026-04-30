import type { Payment, Account, Transaction, LedgerEntry } from "@prisma/client"
import type {
  PaymentDTO,
  AccountDTO,
  TransactionDTO,
  LedgerEntryDTO,
} from "@payflow/shared-types"

// Centralized serialization — all route handlers use these functions.
// createdAt/updatedAt are always converted to ISO strings here, never inline.

export function toPaymentDTO(p: Payment): PaymentDTO {
  return {
    id: p.id,
    orderId: p.orderId,
    amount: p.amount,
    currency: p.currency,
    status: p.status as PaymentDTO["status"],
    provider: p.provider,
    createdAt: p.createdAt.toISOString(),
  }
}

export function toAccountDTO(a: Account): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    currency: a.currency,
    balance: a.balance,
    status: a.status as AccountDTO["status"],
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

export function toLedgerEntryDTO(e: LedgerEntry): LedgerEntryDTO {
  return {
    id: e.id,
    transactionId: e.transactionId,
    accountId: e.accountId,
    type: e.type as "debit" | "credit",
    amount: e.amount,
    currency: e.currency,
    balanceAfter: e.balanceAfter,
    createdAt: e.createdAt.toISOString(),
  }
}

export function toTransactionDTO(
  t: Transaction & { ledgerEntries: LedgerEntry[] }
): TransactionDTO {
  return {
    id: t.id,
    merchantId: t.merchantId,
    debitAccountId: t.debitAccountId,
    creditAccountId: t.creditAccountId,
    type: t.type as TransactionDTO["type"],
    status: t.status as TransactionDTO["status"],
    amount: t.amount,
    currency: t.currency,
    description: t.description,
    idempotencyKey: t.idempotencyKey,
    createdBy: t.createdBy,
    reversalOfId: t.reversalOfId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ledgerEntries: t.ledgerEntries.map(toLedgerEntryDTO),
  }
}
