import type { WebhookEvent } from "@payflow/payment-providers"
import { isValidTransition } from "@payflow/payment-providers"
import { db } from "../lib/db.js"

type StatusSource = "webhook" | "reconciliation" | "manual" | "system"

interface ProcessResult {
  processed: boolean
  reason?: string
}

/**
 * Atomically processes a payment status update.
 *
 * All 5 steps run inside a single $transaction:
 *   1. Idempotency check  — skip if event already processed
 *   2. SELECT FOR UPDATE  — lock the payment row
 *   3. State machine      — reject invalid transitions
 *   4. Update payment     — new status + confirmed amount/currency
 *   5. Audit log + Outbox — immutable record + event for worker
 *
 * If any step fails → full rollback. Money never changes state without a trace.
 */
export async function processPaymentUpdate(
  event: WebhookEvent,
  source: StatusSource = "webhook"
): Promise<ProcessResult> {
  return db.$transaction(async (tx) => {
    // ── Step 1: Idempotency ───────────────────────────────────────────────
    // If we already processed this exact event, return 200 without doing anything.
    // CRITICAL: never throw here — the provider would retry forever on 4xx/5xx.
    const existing = await tx.paymentEvent.findUnique({
      where: { provider_externalEventId: { provider: event.provider, externalEventId: event.externalEventId } },
    })
    if (existing) {
      return { processed: false, reason: "duplicate_event" }
    }

    // ── Step 2: Lock the payment row ─────────────────────────────────────
    // SELECT FOR UPDATE prevents two concurrent processes from modifying
    // the same payment simultaneously (e.g. webhook + reconciliation).
    const payments = await tx.$queryRaw<Array<{
      id: string
      status: string
      amount: number
      currency: string
      merchantId: string
    }>>`
      SELECT id, status, amount, currency, "merchantId"
      FROM "Payment"
      WHERE "externalId" = ${event.externalId}
      FOR UPDATE
    `

    const payment = payments[0]
    if (!payment) {
      return { processed: false, reason: "payment_not_found" }
    }

    // ── Step 3: State machine ─────────────────────────────────────────────
    // Reject transitions that are not allowed (e.g. FAILED → SUCCESS).
    const currentStatus = payment.status as any
    if (!isValidTransition(currentStatus, event.status)) {
      return { processed: false, reason: `invalid_transition_${currentStatus}_to_${event.status}` }
    }

    // ── Step 4: Validate amount/currency match ────────────────────────────
    // If the confirmed amount differs from what we expected, flag for review.
    const amountMismatch = event.amount !== payment.amount || event.currency !== payment.currency
    const newStatus = amountMismatch ? "PROCESSING" : event.status // hold for review if mismatch

    // ── Step 5: Update payment ────────────────────────────────────────────
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus as any,
        externalId: event.externalId,
        confirmedAmount: event.amount,
        confirmedCurrency: event.currency,
      },
    })

    // ── Step 6: Audit log (immutable) ─────────────────────────────────────
    await tx.paymentAuditLog.create({
      data: {
        paymentId: payment.id,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedBy: source,
        metadata: {
          provider: event.provider,
          externalEventId: event.externalEventId,
          amountMismatch,
          confirmedAmount: event.amount,
          confirmedCurrency: event.currency,
        },
      },
    })

    // ── Step 7: Outbox event ──────────────────────────────────────────────
    // The worker picks this up and sends webhooks to the merchant + emails.
    await tx.outboxEvent.create({
      data: {
        type: `payment.${newStatus.toLowerCase()}`,
        payload: {
          paymentId: payment.id,
          merchantId: payment.merchantId,
          status: newStatus,
          amount: payment.amount,
          currency: payment.currency,
          provider: event.provider,
          amountMismatch,
        },
        nextRetryAt: new Date(),
      },
    })

    // ── Step 8: Mark event as processed ───────────────────────────────────
    await tx.paymentEvent.create({
      data: {
        provider: event.provider,
        externalEventId: event.externalEventId,
        externalId: event.externalId,
        eventType: event.eventType,
        rawPayload: event.rawPayload as any,
      },
    })

    return { processed: true }
  })
}
