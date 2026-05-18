import { serve } from "@hono/node-server"
import { app } from "./app.js"
import { db } from "./lib/db.js"
import { logger } from "./lib/logger.js"
import { startOutboxWorker } from "./workers/outboxWorker.js"
import { startReconciliationJob } from "./jobs/reconcile.js"
import { startTrialCheckJob } from "./jobs/subscriptionTrialCheck.js"
import { startDunningJob } from "./jobs/subscriptionDunning.js"

const port = Number(process.env["PORT"]) || 3001

const server = serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, "Server started")
  startOutboxWorker()
  startReconciliationJob()
  startTrialCheckJob()
  startDunningJob()
})

// Graceful shutdown — finish in-flight requests before closing DB connections.
// Required for zero-downtime deploys: Railway/Fly/Render send SIGTERM before replacing the container.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down...")
  server.close(async () => {
    await db.$disconnect()
    logger.info("Shutdown complete")
    process.exit(0)
  })
  // Force-exit after 10s if something hangs
  setTimeout(() => {
    logger.error("Forced shutdown after timeout")
    process.exit(1)
  }, 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))
