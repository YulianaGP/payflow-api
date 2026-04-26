import { db } from "../lib/db.js"
import { resolveProvider } from "../services/providerResolver.js"
import { processPaymentUpdate } from "../services/paymentProcessor.js"

const RECONCILE_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes
const BATCH_SIZE = 100
const PROVIDER_TIMEOUT_MS = 8_000

// Payments stuck longer than these thresholds are candidates for reconciliation.
// PROCESSING gets more time because the provider is actively working on it.
const PENDING_THRESHOLD_MIN = 10
const PROCESSING_THRESHOLD_MIN = 20

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Provider call timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

async function runReconciliation(): Promise<void> {
  const now = new Date()

  const pendingCutoff = new Date(now.getTime() - PENDING_THRESHOLD_MIN * 60 * 1000)
  const processingCutoff = new Date(now.getTime() - PROCESSING_THRESHOLD_MIN * 60 * 1000)

  // FOR UPDATE SKIP LOCKED: safe to run multiple instances simultaneously
  const payments = await db.$queryRaw<Array<{
    id: string
    status: string
    provider: string
    externalId: string
    amount: number
    currency: string
  }>>`
    SELECT id, status, provider, "externalId", amount, currency
    FROM "Payment"
    WHERE "externalId" IS NOT NULL
      AND (
        (status = 'PENDING'     AND "updatedAt" < ${pendingCutoff})
        OR
        (status = 'PROCESSING'  AND "updatedAt" < ${processingCutoff})
      )
    ORDER BY "updatedAt" ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `

  if (payments.length === 0) return

  process.stdout.write(`[reconcile] checking ${payments.length} stale payments\n`)

  // Sequential processing — avoids hammering provider APIs with concurrent requests
  for (const payment of payments) {
    try {
      const provider = resolveProvider(payment.provider as "mercadopago" | "stripe" | "mock")
      const providerStatus = await withTimeout(
        provider.getPaymentStatus(payment.externalId),
        PROVIDER_TIMEOUT_MS
      )

      // Skip if provider reports the same status — no transaction needed
      if (providerStatus === payment.status) continue

      const result = await processPaymentUpdate(
        {
          provider: payment.provider as "mercadopago" | "stripe" | "mock",
          externalEventId: `reconcile_${payment.id}_${Date.now()}`,
          externalId: payment.externalId,
          eventType: "reconciliation",
          status: providerStatus,
          amount: payment.amount,
          currency: payment.currency as any,
          rawPayload: { source: "reconciliation", paymentId: payment.id },
        },
        "reconciliation"
      )

      process.stdout.write(
        `[reconcile] payment=${payment.id} ${payment.status}→${providerStatus} processed=${result.processed} reason=${result.reason ?? "ok"}\n`
      )
    } catch (err) {
      // One failing payment must never stop the rest of the batch
      process.stderr.write(
        `[reconcile] error payment=${payment.id} error=${err instanceof Error ? err.message : String(err)}\n`
      )
    }
  }
}

export function startReconciliationJob(): void {
  process.stdout.write("[reconcile] job started (interval=15min)\n")

  const run = () => {
    runReconciliation().catch((err) => {
      process.stderr.write(`[reconcile] batch error: ${err instanceof Error ? err.message : String(err)}\n`)
    })
  }

  // Delay first run by 1 minute so it doesn't fire at startup alongside the outbox worker
  setTimeout(() => {
    run()
    setInterval(run, RECONCILE_INTERVAL_MS)
  }, 60_000)
}
