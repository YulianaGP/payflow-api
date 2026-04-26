import { serve } from "@hono/node-server"
import { app } from "./app.js"
import { startOutboxWorker } from "./workers/outboxWorker.js"
import { startReconciliationJob } from "./jobs/reconcile.js"

const port = Number(process.env["PORT"]) || 3001

serve({ fetch: app.fetch, port }, () => {
  process.stdout.write(`Server running on http://localhost:${port}\n`)
  startOutboxWorker()
  startReconciliationJob()
})
