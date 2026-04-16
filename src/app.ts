import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { prettyJSON } from "hono/pretty-json"

export const app = new Hono()

app.use("*", logger())
app.use("*", cors())
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
