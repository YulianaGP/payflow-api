import { Hono } from "hono"
import { logger } from "hono/logger"
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
import { openApiSpec } from "./lib/openapi.js"

export const app = new Hono()

app.use("*", logger())
app.use("*", cors()) // NOTE: open in dev — restricted to ALLOWED_ORIGINS on Day 28
app.use("*", prettyJSON())

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
