import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { authMiddleware, requireAdmin } from "../middlewares/auth.js"
import { CreatePlanSchema } from "../schemas/subscriptions.js"
import {
  createPlan,
  listPlans,
  getPlan,
  PlanNotFoundError,
} from "../services/subscriptionService.js"

export const plansRouter = new Hono()

plansRouter.use("*", authMiddleware)

// POST /api/plans — admin only
plansRouter.post("/", requireAdmin, zValidator("json", CreatePlanSchema), async (c) => {
  const input = c.req.valid("json")
  const { merchantId } = c.get("auth")
  const plan = await createPlan(merchantId, input)
  return c.json(plan, 201)
})

// GET /api/plans — all authenticated users (used by /pricing page)
plansRouter.get("/", async (c) => {
  const { merchantId } = c.get("auth")
  const onlyActive = c.req.query("all") !== "true"
  const plans = await listPlans(merchantId, onlyActive)
  return c.json(plans)
})

// GET /api/plans/:id
plansRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const { merchantId } = c.get("auth")
  try {
    const plan = await getPlan(id, merchantId)
    return c.json(plan)
  } catch (err) {
    if (err instanceof PlanNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    throw err
  }
})
