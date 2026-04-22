import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { prettyJSON } from "hono/pretty-json"
import { authRouter } from "./routes/auth.js"
import { keysRouter } from "./routes/keys.js"
import { twofaRouter } from "./routes/twofa.js"

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

app.route("/api/auth", authRouter)
app.route("/api/keys", keysRouter)
app.route("/api/2fa", twofaRouter)
