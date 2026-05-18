import { Hono } from "hono"
import { db } from "../lib/db.js"
import { logger } from "../lib/logger.js"

export const statusRouter = new Hono()

const CACHE_TTL_MS = 60_000 // 60s — fresh enough, cheap to compute

// GET /api/status — public endpoint, no auth required
statusRouter.get("/", async (c) => {
  const services = ["api", "database", "mercadopago", "stripe"]

  // Serve from cache if all checks are recent enough
  const since = new Date(Date.now() - CACHE_TTL_MS)
  const cached = await db.statusCheck.findMany({
    where: { service: { in: services }, checkedAt: { gte: since } },
    orderBy: { checkedAt: "desc" },
    distinct: ["service"],
  })

  if (cached.length === services.length) {
    return c.json(formatResponse(cached))
  }

  // Run fresh checks for missing/stale services
  const stale = services.filter((s) => !cached.find((c) => c.service === s))
  const fresh = await Promise.all(stale.map(runCheck))

  // Write new results to DB — fire and forget so the response isn't delayed
  db.statusCheck.createMany({ data: fresh }).catch((e) => logger.error(e, "statusCheck write failed"))

  const all = [...cached, ...fresh]
  return c.json(formatResponse(all))
})

async function runCheck(service: string) {
  const start = Date.now()
  let status = "operational"
  let error: string | undefined

  try {
    if (service === "database") {
      await db.$queryRaw`SELECT 1`
    } else if (service === "api") {
      // Self — always operational if we got here
    } else if (service === "mercadopago") {
      const res = await fetch("https://api.mercadopago.com/", { signal: AbortSignal.timeout(3000) })
      if (!res.ok) status = "degraded"
    } else if (service === "stripe") {
      const res = await fetch("https://status.stripe.com/api/v2/status.json", { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json() as any
        const indicator = data?.status?.indicator
        if (indicator && indicator !== "none") status = "degraded"
      } else {
        status = "degraded"
      }
    }
  } catch (e: any) {
    status = "down"
    error = e.message
  }

  return {
    service,
    status,
    latencyMs: Date.now() - start,
    error: error ?? null,
    checkedAt: new Date(),
  }
}

function formatResponse(checks: Array<{ service: string; status: string; latencyMs: number | null; checkedAt: Date }>) {
  const services = Object.fromEntries(checks.map((c) => [c.service, { status: c.status, latencyMs: c.latencyMs, checkedAt: c.checkedAt }]))
  const overall = checks.every((c) => c.status === "operational")
    ? "operational"
    : checks.some((c) => c.status === "down")
    ? "down"
    : "degraded"
  return { overall, services, checkedAt: new Date() }
}
