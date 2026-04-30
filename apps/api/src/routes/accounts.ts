import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { AccountStatus } from "@prisma/client"
import { authMiddleware } from "../middlewares/auth.js"
import { CreateAccountSchema, FundAccountSchema } from "../schemas/accounts.js"
import {
  createAccount,
  getAccount,
  listAccounts,
  transitionAccount,
  AccountNotFoundError,
  AccountStateError,
} from "../services/accountService.js"
import { createTransaction } from "../services/transactionService.js"
import { db } from "../lib/db.js"

export const accountsRouter = new Hono()

accountsRouter.use("*", authMiddleware)

// POST /api/accounts
accountsRouter.post("/", zValidator("json", CreateAccountSchema), async (c) => {
  const input = c.req.valid("json")
  const { merchantId } = c.get("auth")
  const account = await createAccount(merchantId, input)
  return c.json(account, 201)
})

// GET /api/accounts
accountsRouter.get(
  "/",
  zValidator("query", z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["ACTIVE", "FROZEN", "CLOSED"]).optional(),
  })),
  async (c) => {
    const { merchantId } = c.get("auth")
    const { cursor, limit, status } = c.req.valid("query")
    const result = await listAccounts(merchantId, {
      cursor,
      limit,
      status: status as AccountStatus | undefined,
    })
    return c.json(result)
  }
)

// GET /api/accounts/:id
accountsRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const account = await getAccount(id, merchantId)
    return c.json(account)
  } catch (err) {
    if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404)
    throw err
  }
})

// POST /api/accounts/:id/fund
// Resolves account currency from DB, then creates a DEPOSIT transaction.
accountsRouter.post("/:id/fund", zValidator("json", FundAccountSchema), async (c) => {
  const { id } = c.req.param()
  const input = c.req.valid("json")
  const { merchantId, userId } = c.get("auth")

  try {
    const account = await db.account.findFirst({ where: { id, merchantId } })
    if (!account) return c.json({ error: `Account ${id} not found` }, 404)

    const { transaction, replayed } = await createTransaction(
      { type: "DEPOSIT", creditAccountId: id, amount: input.amount, currency: account.currency, description: input.description },
      { merchantId, userId }
    )

    if (replayed) c.header("X-Idempotent-Replayed", "true")
    return c.json(transaction, 201)
  } catch (err: any) {
    if (err.name === "AccountFrozenError") return c.json({ error: err.message, code: "ACCOUNT_FROZEN" }, 403)
    if (err.name === "AccountClosedError") return c.json({ error: err.message, code: "ACCOUNT_CLOSED" }, 403)
    throw err
  }
})

// POST /api/accounts/:id/freeze
accountsRouter.post("/:id/freeze", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const account = await transitionAccount(id, merchantId, "freeze")
    return c.json(account)
  } catch (err) {
    if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404)
    if (err instanceof AccountStateError) return c.json({ error: err.message, code: "INVALID_STATE_TRANSITION" }, 409)
    throw err
  }
})

// POST /api/accounts/:id/unfreeze
accountsRouter.post("/:id/unfreeze", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const account = await transitionAccount(id, merchantId, "unfreeze")
    return c.json(account)
  } catch (err) {
    if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404)
    if (err instanceof AccountStateError) return c.json({ error: err.message, code: "INVALID_STATE_TRANSITION" }, 409)
    throw err
  }
})

// POST /api/accounts/:id/close
accountsRouter.post("/:id/close", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const account = await transitionAccount(id, merchantId, "close")
    return c.json(account)
  } catch (err) {
    if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404)
    if (err instanceof AccountStateError) return c.json({ error: err.message, code: "INVALID_STATE_TRANSITION" }, 409)
    if (err instanceof Error && err.message.includes("zero balance")) return c.json({ error: err.message, code: "NON_ZERO_BALANCE" }, 422)
    throw err
  }
})
