import { db } from "../lib/db.js"

const POLL_INTERVAL_MS = 5_000
const BATCH_SIZE = 100
const MAX_ATTEMPTS = 5

// Backoff: 2^attempts seconds, capped at 5 minutes
function nextRetryDelay(attempts: number): number {
  return Math.min(Math.pow(2, attempts), 300) * 1000
}

async function processBatch(): Promise<void> {
  // FOR UPDATE SKIP LOCKED: multiple workers never pick the same event
  const events = await db.$queryRaw<Array<{
    id: string
    type: string
    category: string
    payload: unknown
    attempts: number
  }>>`
    SELECT id, type, category, payload, attempts
    FROM "OutboxEvent"
    WHERE "sentAt" IS NULL
      AND "nextRetryAt" <= NOW()
    ORDER BY "createdAt" ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `

  for (const event of events) {
    const correlationId = (event.payload as any)?.paymentId ?? event.id

    try {
      await dispatch(event)

      await db.outboxEvent.update({
        where: { id: event.id },
        data: { sentAt: new Date() },
      })

      process.stdout.write(`[outbox] sent ${event.type} correlationId=${correlationId}\n`)
    } catch (err) {
      const nextAttempt = event.attempts + 1
      const error = err instanceof Error ? err.message : String(err)

      if (nextAttempt >= MAX_ATTEMPTS) {
        // Move to dead letter — requires manual intervention
        await db.$transaction([
          db.deadLetterEvent.create({
            data: {
              type: event.type,
              payload: event.payload as any,
              lastError: error,
              attempts: nextAttempt,
            },
          }),
          db.outboxEvent.update({
            where: { id: event.id },
            data: { sentAt: new Date(), lastError: `dead_letter: ${error}` },
          }),
        ])
        process.stdout.write(`[outbox] dead_letter ${event.type} correlationId=${correlationId} error=${error}\n`)
      } else {
        const delayMs = nextRetryDelay(nextAttempt)
        await db.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: nextAttempt,
            lastError: error,
            nextRetryAt: new Date(Date.now() + delayMs),
          },
        })
        process.stdout.write(`[outbox] retry ${event.type} attempt=${nextAttempt} delay=${delayMs}ms correlationId=${correlationId}\n`)
      }
    }
  }
}

// Dispatch by category — easy to extend without touching the worker loop
async function dispatch(event: { type: string; category: string; payload: unknown }): Promise<void> {
  if (event.category === "payment") {
    // TODO Day 12: enqueue to BullMQ webhook delivery queue
    // TODO Day 20: enqueue email via Resend
    // For now: log only — real delivery added when BullMQ + Resend are wired up
    return
  }

  if (event.category === "webhook") {
    // External HTTP delivery to merchant webhook URL — implemented in Day 12
    return
  }

  if (event.category === "email") {
    // Email delivery via Resend — implemented in Day 20
    return
  }
}

export function startOutboxWorker(): void {
  process.stdout.write("[outbox] worker started\n")

  // Wrap in async IIFE so the interval doesn't block and errors don't crash the process
  const tick = () => {
    processBatch().catch((err) => {
      process.stderr.write(`[outbox] batch error: ${err instanceof Error ? err.message : String(err)}\n`)
    })
  }

  tick() // run immediately on start
  setInterval(tick, POLL_INTERVAL_MS)
}
