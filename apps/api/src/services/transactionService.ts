import { type Prisma, PrismaClientKnownRequestError, TransactionStatus } from "@prisma/client"
import { db } from "../lib/db.js"
import { sha256 } from "../lib/crypto.js"
import { assertAccountActive, assertSufficientBalance, AccountNotFoundError } from "./accountService.js"
import type { CreateTransactionInput } from "../schemas/transactions.js"

// Scalar-only Account shape for raw SQL queries (SELECT * does not include relations)
type AccountRow = {
  id: string
  merchantId: string
  name: string
  currency: string
  balance: number
  status: string
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

// 60-second window: protects double-clicks and slow network retries
// without blocking legitimate identical transfers after the window expires.
// description is normalized (trim + lowercase) to avoid false negatives from
// minor variations in casing or trailing spaces.
const IDEMPOTENCY_WINDOW_MS = 60_000

export function resolveIdempotencyKey(
  input: {
    merchantId: string
    debitAccountId?: string | null
    creditAccountId?: string | null
    amount: number
    type: string
    description?: string | null
  },
  clientKey?: string
): string {
  if (clientKey) return clientKey

  const window = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)
  const normalizedDescription = (input.description ?? "").trim().toLowerCase()
  const parts = [
    "auto",
    input.merchantId,
    input.debitAccountId ?? "",
    input.creditAccountId ?? "",
    String(input.amount),
    input.type,
    normalizedDescription,
    String(window),
  ]
  return sha256(parts.join(":"))
}

async function findByIdempotencyKey(merchantId: string, key: string) {
  return db.transaction.findUnique({
    where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: key } },
    include: { ledgerEntries: true },
  })
}

// ─── Ledger invariant ─────────────────────────────────────────────────────────

function assertLedgerBalance(entries: { amount: number }[]): void {
  const sum = entries.reduce((acc, e) => acc + e.amount, 0)
  if (sum !== 0) {
    console.error(JSON.stringify({ event: "ledger_imbalance", entries, sum }))
    throw new Error(`Ledger imbalance detected: entries sum to ${sum}, expected 0`)
  }
}

// ─── Account locking ──────────────────────────────────────────────────────────

// Single query with ORDER BY id — deterministic lock order eliminates A→B vs B→A deadlocks.
async function acquireAccountLocks(
  tx: Prisma.TransactionClient,
  accountIds: string[]
): Promise<Map<string, AccountRow>> {
  const unique = [...new Set(accountIds)].sort()

  // Pass the array as a single Prisma parameter — PostgreSQL ANY() accepts an array param.
  const rows = await tx.$queryRaw<AccountRow[]>`
    SELECT * FROM "Account"
    WHERE id = ANY(${unique})
    ORDER BY id
    FOR UPDATE
  `

  const map = new Map<string, AccountRow>()
  for (const row of rows) map.set(row.id, row)

  for (const id of unique) {
    if (!map.has(id)) throw new AccountNotFoundError(id)
  }

  return map
}

// ─── Execution helpers ────────────────────────────────────────────────────────

type LedgerEntryDraft = {
  accountId: string
  type: "debit" | "credit"
  amount: number
  currency: string
  balanceAfter: number
}

async function commitTransaction(
  tx: Prisma.TransactionClient,
  data: {
    merchantId: string
    debitAccountId?: string | null
    creditAccountId?: string | null
    type: string
    amount: number
    currency: string
    description?: string | null
    metadata?: Record<string, unknown> | null
    idempotencyKey: string
    createdBy: string
    reversalOfId?: string
    entries: LedgerEntryDraft[]
  }
) {
  const transaction = await tx.transaction.create({
    data: {
      merchantId: data.merchantId,
      debitAccountId: data.debitAccountId,
      creditAccountId: data.creditAccountId,
      type: data.type as any,
      status: "COMPLETED",
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      metadata: data.metadata as any,
      idempotencyKey: data.idempotencyKey,
      createdBy: data.createdBy,
      reversalOfId: data.reversalOfId,
    },
  })

  await tx.ledgerEntry.createMany({
    data: data.entries.map((e) => ({ ...e, transactionId: transaction.id })),
  })

  for (const entry of data.entries) {
    await tx.account.update({
      where: { id: entry.accountId },
      data: { balance: entry.balanceAfter },
    })
  }

  return transaction
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type StoredTransaction = {
  id: string
  merchantId: string
  debitAccountId: string | null
  creditAccountId: string | null
  type: string
  status: string
  amount: number
  currency: string
  description: string | null
  metadata: unknown
  idempotencyKey: string | null
  createdBy: string
  reversalOfId: string | null
  createdAt: Date
  updatedAt: Date
  ledgerEntries?: unknown[]
}

export type TransactionResult = {
  transaction: StoredTransaction
  replayed: boolean
}

export async function createTransaction(
  input: CreateTransactionInput,
  context: { merchantId: string; userId: string }
): Promise<TransactionResult> {
  const idempotencyKey = resolveIdempotencyKey(
    {
      merchantId: context.merchantId,
      debitAccountId: "debitAccountId" in input ? input.debitAccountId : null,
      creditAccountId: "creditAccountId" in input ? input.creditAccountId : null,
      amount: input.amount,
      type: input.type,
      description: input.description,
    },
    input.idempotencyKey
  )

  // Optimistic check before acquiring locks — avoids unnecessary DB work
  const existing = await findByIdempotencyKey(context.merchantId, idempotencyKey)
  if (existing) {
    console.info(JSON.stringify({
      event: "idempotent_replay",
      transactionId: existing.id,
      merchantId: context.merchantId,
      idempotencyKey,
      originalCreatedAt: existing.createdAt,
    }))
    return { transaction: existing as any, replayed: true }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      if (input.type === "TRANSFER") {
        return executeTransfer(tx, input as any, context, idempotencyKey)
      }
      if (input.type === "DEPOSIT") {
        return executeDeposit(tx, input as any, context, idempotencyKey)
      }
      return executeWithdrawal(tx, input as any, context, idempotencyKey)
    })
    return { transaction: result as any, replayed: false }
  } catch (err) {
    // Race condition: two concurrent requests passed the optimistic check.
    // The second one hits the unique constraint — fetch and return the winner's result.
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await findByIdempotencyKey(context.merchantId, idempotencyKey)
      if (raced) {
        console.info(JSON.stringify({
          event: "idempotent_replay",
          transactionId: raced.id,
          merchantId: context.merchantId,
          idempotencyKey,
          reason: "race_condition",
        }))
        return { transaction: raced as any, replayed: true }
      }
    }
    throw err
  }
}

async function executeTransfer(
  tx: Prisma.TransactionClient,
  input: { debitAccountId: string; creditAccountId: string; amount: number; currency: string; description?: string; metadata?: Record<string, unknown> },
  context: { merchantId: string; userId: string },
  idempotencyKey: string
) {
  const accounts = await acquireAccountLocks(tx, [input.debitAccountId, input.creditAccountId])
  const debit = accounts.get(input.debitAccountId)!
  const credit = accounts.get(input.creditAccountId)!

  assertAccountActive(debit)
  assertAccountActive(credit)

  if (debit.currency !== credit.currency) {
    throw new Error(
      `Currency mismatch: debit account is ${debit.currency}, credit account is ${credit.currency}`
    )
  }
  if (debit.currency !== input.currency) {
    throw new Error(`Transaction currency ${input.currency} does not match account currency ${debit.currency}`)
  }

  assertSufficientBalance(debit, input.amount)

  const entries: LedgerEntryDraft[] = [
    { accountId: debit.id,  type: "debit",  amount: -input.amount, currency: input.currency, balanceAfter: debit.balance  - input.amount },
    { accountId: credit.id, type: "credit", amount: +input.amount, currency: input.currency, balanceAfter: credit.balance + input.amount },
  ]
  assertLedgerBalance(entries)

  return commitTransaction(tx, {
    merchantId: context.merchantId,
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    type: "TRANSFER",
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    metadata: input.metadata,
    idempotencyKey,
    createdBy: `user:${context.userId}`,
    entries,
  })
}

async function executeDeposit(
  tx: Prisma.TransactionClient,
  input: { creditAccountId: string; amount: number; currency: string; description?: string; metadata?: Record<string, unknown> },
  context: { merchantId: string; userId: string },
  idempotencyKey: string
) {
  const accounts = await acquireAccountLocks(tx, [input.creditAccountId])
  const credit = accounts.get(input.creditAccountId)!

  assertAccountActive(credit)

  if (credit.currency !== input.currency) {
    throw new Error(`Transaction currency ${input.currency} does not match account currency ${credit.currency}`)
  }

  // DEPOSIT has no internal counterpart — one entry only (documented limitation)
  const entries: LedgerEntryDraft[] = [
    { accountId: credit.id, type: "credit", amount: +input.amount, currency: input.currency, balanceAfter: credit.balance + input.amount },
  ]

  return commitTransaction(tx, {
    merchantId: context.merchantId,
    creditAccountId: credit.id,
    type: "DEPOSIT",
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    metadata: input.metadata,
    idempotencyKey,
    createdBy: `user:${context.userId}`,
    entries,
  })
}

async function executeWithdrawal(
  tx: Prisma.TransactionClient,
  input: { debitAccountId: string; amount: number; currency: string; description?: string; metadata?: Record<string, unknown> },
  context: { merchantId: string; userId: string },
  idempotencyKey: string
) {
  const accounts = await acquireAccountLocks(tx, [input.debitAccountId])
  const debit = accounts.get(input.debitAccountId)!

  assertAccountActive(debit)

  if (debit.currency !== input.currency) {
    throw new Error(`Transaction currency ${input.currency} does not match account currency ${debit.currency}`)
  }

  assertSufficientBalance(debit, input.amount)

  // WITHDRAWAL has no internal counterpart — one entry only (documented limitation)
  const entries: LedgerEntryDraft[] = [
    { accountId: debit.id, type: "debit", amount: -input.amount, currency: input.currency, balanceAfter: debit.balance - input.amount },
  ]

  return commitTransaction(tx, {
    merchantId: context.merchantId,
    debitAccountId: debit.id,
    type: "WITHDRAWAL",
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    metadata: input.metadata,
    idempotencyKey,
    createdBy: `user:${context.userId}`,
    entries,
  })
}

export async function reverseTransaction(
  originalId: string,
  context: { merchantId: string; userId: string }
): Promise<TransactionResult> {
  const original = await db.transaction.findFirst({
    where: { id: originalId, merchantId: context.merchantId },
    include: { ledgerEntries: true, reversedBy: true },
  })

  if (!original) throw new Error(`Transaction ${originalId} not found`)
  if (original.status !== TransactionStatus.COMPLETED) {
    throw new Error(`Only COMPLETED transactions can be reversed (current: ${original.status})`)
  }
  if (original.reversedBy) {
    throw new Error(`Transaction ${originalId} has already been reversed`)
  }

  const accountIds = original.ledgerEntries.map((e) => e.accountId)
  const idempotencyKey = resolveIdempotencyKey(
    { merchantId: context.merchantId, amount: original.amount, type: "REFUND", description: `reversal:${originalId}` },
  )

  const result = await db.$transaction(async (tx) => {
    const accounts = await acquireAccountLocks(tx, accountIds)

    // Invert every ledger entry from the original transaction
    const entries: LedgerEntryDraft[] = original.ledgerEntries.map((e) => {
      const account = accounts.get(e.accountId)!
      const invertedAmount = -e.amount
      return {
        accountId: e.accountId,
        type: (invertedAmount > 0 ? "credit" : "debit") as "credit" | "debit",
        amount: invertedAmount,
        currency: e.currency,
        balanceAfter: account.balance + invertedAmount,
      }
    })

    // Verify sufficient balance for debit sides of the reversal
    for (const entry of entries) {
      if (entry.amount < 0) {
        const account = accounts.get(entry.accountId)!
        if (account.balance < -entry.amount) {
          throw new Error(
            `Insufficient balance in account ${entry.accountId} to process reversal`
          )
        }
      }
    }

    // REFUND (2-entry reversal) must sum to 0
    if (entries.length === 2) assertLedgerBalance(entries)

    const reversal = await commitTransaction(tx, {
      merchantId: context.merchantId,
      debitAccountId: original.creditAccountId,
      creditAccountId: original.debitAccountId,
      type: "REFUND",
      amount: original.amount,
      currency: original.currency,
      description: `Reversal of transaction ${originalId}`,
      idempotencyKey,
      createdBy: `user:${context.userId}`,
      reversalOfId: originalId,
      entries,
    })

    await tx.transaction.update({
      where: { id: originalId },
      data: { status: TransactionStatus.REVERSED },
    })

    return reversal
  })

  return { transaction: result as any, replayed: false }
}

export async function getTransaction(id: string, merchantId: string) {
  const tx = await db.transaction.findFirst({
    where: { id, merchantId },
    include: { ledgerEntries: { orderBy: { createdAt: "asc" } } },
  })
  if (!tx) throw new Error(`Transaction ${id} not found`)
  return tx
}

export async function listTransactions(
  merchantId: string,
  opts: {
    cursor?: string
    limit: number
    accountId?: string
    type?: string
    status?: string
  }
) {
  const take = opts.limit + 1
  const transactions = await db.transaction.findMany({
    where: {
      merchantId,
      ...(opts.accountId ? {
        OR: [
          { debitAccountId: opts.accountId },
          { creditAccountId: opts.accountId },
        ],
      } : {}),
      ...(opts.type ? { type: opts.type as any } : {}),
      ...(opts.status ? { status: opts.status as any } : {}),
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { ledgerEntries: { orderBy: { createdAt: "asc" } } },
  })

  const hasMore = transactions.length > opts.limit
  return {
    data: transactions.slice(0, opts.limit),
    nextCursor: hasMore ? transactions[opts.limit - 1]!.id : null,
  }
}
