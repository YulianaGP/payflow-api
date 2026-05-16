"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type ConnectionState = "connecting" | "connected" | "disconnected"

export function PaymentStream() {
  const router = useRouter()
  const esRef = useRef<EventSource | null>(null)
  const [state, setState] = useState<ConnectionState>("connecting")

  useEffect(() => {
    let es: EventSource

    function connect() {
      es = new EventSource("/api/payments/stream")
      esRef.current = es
      setState("connecting")

      es.onopen = () => {
        setState("connected")
      }

      es.addEventListener("payment_updated", () => {
        // Re-fetches all server component data on the current page
        router.refresh()
      })

      es.onerror = () => {
        setState("disconnected")
        es.close()
        // EventSource auto-reconnects — we close and let the browser handle it.
        // A 503 (connection limit) means the server is at capacity; auto-retry is fine.
      }
    }

    connect()

    return () => {
      esRef.current?.close()
    }
  }, [router])

  // Small status dot — visible feedback without taking UI space
  const color =
    state === "connected" ? "bg-green-500" : state === "connecting" ? "bg-yellow-400" : "bg-gray-400"
  const label =
    state === "connected" ? "Live" : state === "connecting" ? "Connecting…" : "Disconnected"

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
