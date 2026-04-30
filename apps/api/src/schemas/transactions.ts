import { z } from "zod"

const SUPPORTED_CURRENCIES = ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] as const

const BaseTransactionFields = {
  amount: z.number().int().min(1, "Minimum amount: 1 cent"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  description: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().max(255).optional(),
}

// Each variant enforces the correct account combination at the type level —
// impossible to send TRANSFER without both accounts, or DEPOSIT with a debit account.

export const TransferSchema = z.object({
  ...BaseTransactionFields,
  type: z.literal("TRANSFER"),
  debitAccountId: z.string().cuid("Invalid debit account ID"),
  creditAccountId: z.string().cuid("Invalid credit account ID"),
})

export const DepositSchema = z.object({
  ...BaseTransactionFields,
  type: z.literal("DEPOSIT"),
  creditAccountId: z.string().cuid("Invalid credit account ID"),
})

export const WithdrawalSchema = z.object({
  ...BaseTransactionFields,
  type: z.literal("WITHDRAWAL"),
  debitAccountId: z.string().cuid("Invalid debit account ID"),
})

export const CreateTransactionSchema = z.discriminatedUnion("type", [
  TransferSchema,
  DepositSchema,
  WithdrawalSchema,
])

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>
export type TransferInput = z.infer<typeof TransferSchema>
export type DepositInput = z.infer<typeof DepositSchema>
export type WithdrawalInput = z.infer<typeof WithdrawalSchema>
