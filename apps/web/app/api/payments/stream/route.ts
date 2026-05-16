import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/payments/stream`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Stream unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevents nginx / Vercel from buffering the SSE stream
      "X-Accel-Buffering": "no",
    },
  })
}
