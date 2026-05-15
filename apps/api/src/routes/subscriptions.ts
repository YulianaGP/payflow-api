import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { authMiddleware } from "../middlewares/auth.js"
import { CreateSubscriptionSchema, ChangePlanSchema } from "../schemas/subscriptions.js"
import {
  createSubscription,
  cancelSubscription,
  getSubscription,
  listSubscriptions,
  previewPlanChange,
  changePlan,
  SubscriptionNotFoundError,
  SubscriptionAlreadyActiveError,
  SubscriptionCanceledError,
  SubscriptionCurrencyMismatchError,
  PlanNotFoundError,
  CrossMerchantError,
} from "../services/subscriptionService.js"

export const subscriptionsRouter = new Hono()

subscriptionsRouter.use("*", authMiddleware)

// POST /api/subscriptions — subscribe to a plan
subscriptionsRouter.post("/", zValidator("json", CreateSubscriptionSchema), async (c) => {
  const { planId } = c.req.valid("json")
  const { userId, merchantId } = c.get("auth")

  try {
    const subscription = await createSubscription(planId, { userId, merchantId })
    return c.json(subscription, 201)
  } catch (err) {
    if (err instanceof PlanNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    if (err instanceof CrossMerchantError) return c.json({ error: err.message, code: err.code }, 403)
    if (err instanceof SubscriptionAlreadyActiveError) return c.json({ error: err.message, code: err.code }, 409)
    throw err
  }
})

// GET /api/subscriptions — list (ADMIN: all merchant subs, USER: own subs)
subscriptionsRouter.get("/", async (c) => {
  const auth = c.get("auth")
  const subscriptions = await listSubscriptions(auth)
  return c.json(subscriptions)
})

// GET /api/subscriptions/:id
subscriptionsRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const auth = c.get("auth")

  try {
    const subscription = await getSubscription(id, auth)
    return c.json(subscription)
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    throw err
  }
})

// POST /api/subscriptions/:id/cancel — schedule cancellation at period end
subscriptionsRouter.post("/:id/cancel", async (c) => {
  const { id } = c.req.param()
  const { userId, merchantId } = c.get("auth")

  try {
    const subscription = await cancelSubscription(id, { userId, merchantId })
    return c.json(subscription)
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    if (err instanceof SubscriptionCanceledError) return c.json({ error: err.message, code: err.code }, 409)
    throw err
  }
})

// GET /api/subscriptions/:id/plan-change-preview?newPlanId=X
subscriptionsRouter.get(
  "/:id/plan-change-preview",
  zValidator("query", z.object({ newPlanId: z.string().cuid("Invalid plan ID") })),
  async (c) => {
    const { id } = c.req.param()
    const { newPlanId } = c.req.valid("query")
    const { userId, merchantId } = c.get("auth")

    try {
      const preview = await previewPlanChange(id, newPlanId, { userId, merchantId })
      return c.json(preview)
    } catch (err) {
      if (err instanceof SubscriptionNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
      if (err instanceof SubscriptionCanceledError) return c.json({ error: err.message, code: err.code }, 409)
      if (err instanceof PlanNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
      if (err instanceof CrossMerchantError) return c.json({ error: err.message, code: err.code }, 403)
      if (err instanceof SubscriptionCurrencyMismatchError) return c.json({ error: err.message, code: err.code }, 422)
      throw err
    }
  }
)

// POST /api/subscriptions/:id/change-plan
subscriptionsRouter.post("/:id/change-plan", zValidator("json", ChangePlanSchema), async (c) => {
  const { id } = c.req.param()
  const { newPlanId } = c.req.valid("json")
  const { userId, merchantId } = c.get("auth")

  try {
    const subscription = await changePlan(id, newPlanId, { userId, merchantId })
    return c.json(subscription)
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    if (err instanceof SubscriptionCanceledError) return c.json({ error: err.message, code: err.code }, 409)
    if (err instanceof PlanNotFoundError) return c.json({ error: err.message, code: err.code }, 404)
    if (err instanceof CrossMerchantError) return c.json({ error: err.message, code: err.code }, 403)
    if (err instanceof SubscriptionCurrencyMismatchError) return c.json({ error: err.message, code: err.code }, 422)
    if (err instanceof Error && err.message.includes("Payment failed")) return c.json({ error: err.message, code: "PAYMENT_FAILED" }, 402)
    throw err
  }
})
