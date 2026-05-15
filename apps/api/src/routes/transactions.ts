import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { authMiddleware } from "../middlewares/auth.js"
import { CreateTransactionSchema } from "../schemas/transactions.js"
import {
  createTransaction,
  reverseTransaction,
  getTransaction,
  listTransactions,
} from "../services/transactionService.js"
import {
  AccountNotFoundError,
  AccountFrozenError,
  AccountClosedError,
  InsufficientBalanceError,
  CurrencyMismatchError,
  TransactionNotFoundError,
  AlreadyReversedError,
  InvalidStatusTransitionError,
} from "../services/accountService.js"

export const transactionsRouter = new Hono()

transactionsRouter.use("*", authMiddleware)

// POST /api/transactions
transactionsRouter.post("/", zValidator("json", CreateTransactionSchema), async (c) => {
  const input = c.req.valid("json")
  const { merchantId, userId } = c.get("auth")

  try {
    const { transaction, replayed } = await createTransaction(input, { merchantId, userId })
    if (replayed) c.header("X-Idempotent-Replayed", "true")
    return c.json(transaction, replayed ? 200 : 201)
  } catch (err) {
    if (err instanceof AccountNotFoundError)    return c.json({ error: err.message }, 404)
    if (err instanceof AccountFrozenError)      return c.json({ error: err.message, code: "ACCOUNT_FROZEN" }, 403)
    if (err instanceof AccountClosedError)      return c.json({ error: err.message, code: "ACCOUNT_CLOSED" }, 403)
    if (err instanceof CurrencyMismatchError)   return c.json({ error: err.message, code: err.code }, 422)
    if (err instanceof InsufficientBalanceError) return c.json({ error: err.message, code: err.code }, 422)
    throw err
  }
})

// GET /api/transactions
transactionsRouter.get(
  "/",
  zValidator("query", z.object({
    cursor:    z.string().optional(),
    limit:     z.coerce.number().int().min(1).max(100).default(20),
    accountId: z.string().optional(),
    type:      z.enum(["TRANSFER", "DEPOSIT", "WITHDRAWAL", "REFUND"]).optional(),
    status:    z.enum(["COMPLETED", "FAILED", "REVERSED"]).optional(),
  })),
  async (c) => {
    const { merchantId } = c.get("auth")
    const { cursor, limit, accountId, type, status } = c.req.valid("query")
    const result = await listTransactions(merchantId, { cursor, limit, accountId, type, status })
    return c.json(result)
  }
)

// GET /api/transactions/:id
transactionsRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const tx = await getTransaction(id, merchantId)
    return c.json(tx)
  } catch (err) {
    if (err instanceof TransactionNotFoundError) return c.json({ error: err.message }, 404)
    throw err
  }
})

// POST /api/transactions/:id/reverse
transactionsRouter.post("/:id/reverse", async (c) => {
  const { id } = c.req.param()
  const { merchantId, userId } = c.get("auth")

  try {
    const { transaction } = await reverseTransaction(id, { merchantId, userId })
    return c.json(transaction, 201)
  } catch (err) {
    if (err instanceof TransactionNotFoundError)     return c.json({ error: err.message }, 404)
    if (err instanceof AlreadyReversedError)         return c.json({ error: err.message, code: err.code }, 409)
    if (err instanceof InvalidStatusTransitionError) return c.json({ error: err.message, code: err.code }, 409)
    if (err instanceof InsufficientBalanceError)     return c.json({ error: err.message, code: "REVERSAL_INSUFFICIENT_FUNDS" }, 422)
    throw err
  }
})
