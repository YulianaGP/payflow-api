import { Hono } from "hono"
import { cors } from "hono/cors"
import { prettyJSON } from "hono/pretty-json"
import { swaggerUI } from "@hono/swagger-ui"
import { authRouter } from "./routes/auth.js"
import { keysRouter } from "./routes/keys.js"
import { twofaRouter } from "./routes/twofa.js"
import { paymentsRouter } from "./routes/payments.js"
import { webhooksRouter } from "./routes/webhooks.js"
import { accountsRouter } from "./routes/accounts.js"
import { transactionsRouter } from "./routes/transactions.js"
import { plansRouter } from "./routes/plans.js"
import { subscriptionsRouter } from "./routes/subscriptions.js"
import { disputesRouter } from "./routes/disputes.js"
import { invoicesRouter } from "./routes/invoices.js"
import { statusRouter } from "./routes/status.js"
import { openApiSpec } from "./lib/openapi.js"
import { securityHeaders } from "./middlewares/security.js"
import { logger } from "./lib/logger.js"

// Parse CORS_ORIGINS env var — comma-separated list of allowed origins.
// Falls back to open in dev so curl / Postman work without extra config.
const isDev = process.env["NODE_ENV"] !== "production"
const allowedOrigins = process.env["CORS_ORIGINS"]
  ? process.env["CORS_ORIGINS"].split(",").map((o) => o.trim())
  : []

export const app = new Hono()

app.use("*", cors(
  isDev || allowedOrigins.length === 0
    ? { origin: "*" }
    : {
        origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true,
      }
))
app.use("*", securityHeaders)
app.use("*", prettyJSON())

// Request logging using pino — replaces hono/logger for structured output
app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start })
})

app.get("/", (c) => {
  return c.json({
    name: "payflow-api",
    version: "1.0.0",
    status: "ok",
    docs: "/docs",
  })
})

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.get("/openapi.json", (c) => c.json(openApiSpec))
app.get("/docs", swaggerUI({ url: "/openapi.json" }))

app.route("/api/auth", authRouter)
app.route("/api/keys", keysRouter)
app.route("/api/2fa", twofaRouter)
app.route("/api/payments", paymentsRouter)
app.route("/api/webhooks", webhooksRouter)
app.route("/api/accounts", accountsRouter)
app.route("/api/transactions", transactionsRouter)
app.route("/api/plans", plansRouter)
app.route("/api/subscriptions", subscriptionsRouter)
app.route("/api/disputes", disputesRouter)
app.route("/api/invoices", invoicesRouter)
app.route("/api/status", statusRouter)
