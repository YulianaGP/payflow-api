import { z } from "zod"

const SUPPORTED_CURRENCIES = ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] as const

export const CreatePlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().int().min(1, "Minimum price: 1 cent"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  interval: z.enum(["month", "year"]),
  intervalCount: z.number().int().min(1).max(12).default(1),
  trialDays: z.number().int().min(0).max(365).default(0),
})

export const CreateSubscriptionSchema = z.object({
  planId: z.string().cuid("Invalid plan ID"),
})

export const ChangePlanSchema = z.object({
  newPlanId: z.string().cuid("Invalid plan ID"),
})

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>
export type ChangePlanInput = z.infer<typeof ChangePlanSchema>
