import { Hono } from "hono"
import { db } from "../lib/db.js"
import { authMiddleware } from "../middlewares/auth.js"

export const disputesRouter = new Hono()

disputesRouter.use("*", authMiddleware)

// GET /api/disputes — list disputes for the authenticated merchant (admin sees all)
disputesRouter.get("/", async (c) => {
  const { merchantId, role } = c.get("auth")

  const disputes = await db.dispute.findMany({
    where: role === "ADMIN" ? {} : { merchantId },
    include: {
      payment: {
        select: { orderId: true, amount: true, currency: true, provider: true },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  })

  return c.json(disputes)
})

// GET /api/disputes/:id — single dispute detail
disputesRouter.get("/:id", async (c) => {
  const { id } = c.req.param()
  const { merchantId, role } = c.get("auth")

  const dispute = await db.dispute.findUnique({
    where: { id },
    include: {
      payment: {
        select: { orderId: true, amount: true, currency: true, provider: true, status: true },
      },
    },
  })

  if (!dispute) return c.json({ error: "Dispute not found" }, 404)
  if (role !== "ADMIN" && dispute.merchantId !== merchantId) {
    return c.json({ error: "Dispute not found" }, 404)
  }

  return c.json(dispute)
})
