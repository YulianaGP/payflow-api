import { z } from "zod"

const SUPPORTED_CURRENCIES = ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] as const

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.enum(SUPPORTED_CURRENCIES),
  metadata: z.record(z.unknown()).optional(),
})

export const FundAccountSchema = z.object({
  amount: z.number().int().min(1, "Minimum amount: 1 cent"),
  description: z.string().max(255).optional(),
})

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>
export type FundAccountInput = z.infer<typeof FundAccountSchema>
