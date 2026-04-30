import { AccountStatus, type Account, type Prisma } from "@prisma/client"
import { db } from "../lib/db.js"

// ─── State machine ────────────────────────────────────────────────────────────

type AccountTransition = "freeze" | "unfreeze" | "close"

const VALID_TRANSITIONS: Record<AccountStatus, AccountTransition[]> = {
  ACTIVE: ["freeze", "close"],
  FROZEN: ["unfreeze", "close"],
  CLOSED: [],
}

const NEXT_STATUS: Record<AccountTransition, AccountStatus> = {
  freeze: AccountStatus.FROZEN,
  unfreeze: AccountStatus.ACTIVE,
  close: AccountStatus.CLOSED,
}

export class AccountStateError extends Error {
  constructor(current: AccountStatus, transition: AccountTransition) {
    super(`Cannot ${transition} an account with status ${current}`)
    this.name = "AccountStateError"
  }
}

export class AccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Account ${id} not found`)
    this.name = "AccountNotFoundError"
  }
}

export class AccountFrozenError extends Error {
  constructor() {
    super("Account is frozen and cannot process transactions")
    this.name = "AccountFrozenError"
  }
}

export class AccountClosedError extends Error {
  constructor() {
    super("Account is closed and cannot process transactions")
    this.name = "AccountClosedError"
  }
}

function applyTransition(account: Account, transition: AccountTransition): AccountStatus {
  const allowed = VALID_TRANSITIONS[account.status]
  if (!allowed.includes(transition)) {
    throw new AccountStateError(account.status, transition)
  }
  if (transition === "close" && account.balance !== 0) {
    throw new Error("Account must have zero balance before closing")
  }
  return NEXT_STATUS[transition]
}

// ─── Operations ───────────────────────────────────────────────────────────────

export async function createAccount(
  merchantId: string,
  input: { name: string; currency: string; metadata?: Record<string, unknown> }
) {
  return db.account.create({
    data: {
      merchantId,
      name: input.name,
      currency: input.currency,
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    },
  })
}

export async function getAccount(id: string, merchantId: string) {
  const account = await db.account.findFirst({
    where: { id, merchantId },
    include: {
      ledgerEntries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  })
  if (!account) throw new AccountNotFoundError(id)
  return account
}

export async function listAccounts(
  merchantId: string,
  opts: { cursor?: string; limit: number; status?: AccountStatus }
) {
  const take = opts.limit + 1
  const accounts = await db.account.findMany({
    where: {
      merchantId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  })
  const hasMore = accounts.length > opts.limit
  return {
    data: accounts.slice(0, opts.limit),
    nextCursor: hasMore ? accounts[opts.limit - 1]!.id : null,
  }
}

export async function transitionAccount(
  id: string,
  merchantId: string,
  transition: AccountTransition
) {
  const account = await db.account.findFirst({ where: { id, merchantId } })
  if (!account) throw new AccountNotFoundError(id)

  const nextStatus = applyTransition(account, transition)
  return db.account.update({ where: { id }, data: { status: nextStatus } })
}

// ─── Balance verification (audit/debug — not in critical path) ────────────────

export async function verifyBalance(
  accountId: string,
  tx?: Prisma.TransactionClient
): Promise<{ valid: boolean; cached: number; computed: number }> {
  const client = tx ?? db
  const [account, sum] = await Promise.all([
    client.account.findUnique({ where: { id: accountId } }),
    client.ledgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } }),
  ])
  if (!account) throw new AccountNotFoundError(accountId)
  const computed = sum._sum.amount ?? 0
  return { valid: account.balance === computed, cached: account.balance, computed }
}

// ─── Guard helpers used by transaction service ────────────────────────────────

// Accepts a minimal shape so raw-query results (AccountRow) and ORM results both work
export function assertAccountActive(account: { id: string; status: string }): void {
  if (account.status === AccountStatus.FROZEN) throw new AccountFrozenError()
  if (account.status === AccountStatus.CLOSED) throw new AccountClosedError()
}

export function assertSufficientBalance(account: { id: string; balance: number }, amount: number): void {
  if (account.balance < amount) {
    throw new Error(
      `Insufficient balance in account ${account.id}: has ${account.balance}, needs ${amount}`
    )
  }
}
