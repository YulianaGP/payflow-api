import { serve } from "@hono/node-server"
import { app } from "./app.js"

const port = Number(process.env["PORT"]) || 3001

serve({ fetch: app.fetch, port }, () => {
  process.stdout.write(`Server running on http://localhost:${port}\n`)
})
