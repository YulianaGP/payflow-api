import { db } from "../lib/db.js"
import { sendEmail } from "../lib/email.js"
import {
  paymentSuccessHtml,
  paymentFailedHtml,
  passwordResetHtml,
  subscriptionDunningWarningHtml,
  subscriptionDunningUrgentHtml,
  subscriptionCanceledDunningHtml,
  subscriptionPaymentRecoveredHtml,
} from "../lib/emailTemplates.js"

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
    const payload = event.payload as {
      paymentId: string
      status: string
      amount: number
      currency: string
      orderId?: string
    }

    const terminal = payload.status === "SUCCESS" || payload.status === "FAILED"
    if (!terminal) return

    // Fetch customerEmail from payment metadata
    const payment = await db.payment.findUnique({
      where: { id: payload.paymentId },
      select: { metadata: true, orderId: true, createdAt: true },
    })
    const meta = payment?.metadata as { customerEmail?: string; description?: string } | null
    const to = meta?.customerEmail
    if (!to) return

    const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000"

    if (payload.status === "SUCCESS") {
      await sendEmail({
        to,
        subject: "Payment confirmed — PayFlow",
        html: paymentSuccessHtml({
          paymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
          orderId: payment?.orderId ?? "",
          createdAt: payment?.createdAt ?? new Date(),
          ...(meta?.description !== undefined ? { description: meta.description } : {}),
          receiptUrl: `${APP_URL}/api/payments/${payload.paymentId}/receipt`,
        }),
      })
    } else {
      await sendEmail({
        to,
        subject: "Your payment could not be processed — PayFlow",
        html: paymentFailedHtml({
          paymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
          orderId: payment?.orderId ?? "",
          createdAt: payment?.createdAt ?? new Date(),
          retryUrl: `${APP_URL}/checkout`,
        }),
      })
    }
    return
  }

  if (event.category === "subscription") {
    // Subscription state change events — logged here; webhook fanout added in Day 24
    const payload = event.payload as { subscriptionId: string; merchantId: string }
    process.stdout.write(
      `[outbox] subscription event ${event.type} subscriptionId=${payload.subscriptionId}\n`
    )
    return
  }

  if (event.category === "subscription_email") {
    const payload = event.payload as {
      subscriptionId: string
      merchantId: string
      userId: string
      daysSinceFailure?: number
      gracePeriodEndsAt?: string | null
    }

    // Resolve user email and subscription details
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    })
    const subscription = await db.subscription.findUnique({
      where: { id: payload.subscriptionId },
      include: { plan: { select: { name: true } } },
    })
    if (!user?.email || !subscription) return

    const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000"
    const updatePaymentUrl = `${APP_URL}/dashboard/subscription`
    const planName = subscription.plan.name

    if (event.type === "subscription.dunning_warning") {
      const endsAt = payload.gracePeriodEndsAt
        ? new Date(payload.gracePeriodEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "soon"
      await sendEmail({
        to: user.email,
        subject: `Action required: update your payment method — ${planName}`,
        html: subscriptionDunningWarningHtml({ planName, gracePeriodEndsAt: endsAt, updatePaymentUrl }),
      })
      return
    }

    if (event.type === "subscription.dunning_urgent") {
      const endsAt = payload.gracePeriodEndsAt
        ? new Date(payload.gracePeriodEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "soon"
      await sendEmail({
        to: user.email,
        subject: `Urgent: your ${planName} access expires soon`,
        html: subscriptionDunningUrgentHtml({ planName, gracePeriodEndsAt: endsAt, updatePaymentUrl }),
      })
      return
    }

    if (event.type === "subscription.dunning_canceled") {
      await sendEmail({
        to: user.email,
        subject: `Your ${planName} subscription has been canceled`,
        html: subscriptionCanceledDunningHtml({ planName }),
      })
      return
    }

    if (event.type === "subscription.payment_recovered") {
      const nextBilling = subscription.currentPeriodEnd.toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
      await sendEmail({
        to: user.email,
        subject: `Payment recovered — ${planName} subscription active`,
        html: subscriptionPaymentRecoveredHtml({ planName, nextBillingDate: nextBilling }),
      })
      return
    }

    return
  }

  if (event.category === "webhook") {
    // External HTTP delivery to merchant webhook URL — Day 12 (BullMQ)
    return
  }

  if (event.category === "email") {
    const payload = event.payload as { email: string; resetToken?: string; expiresAt?: string }

    if (event.type === "auth.password_reset" && payload.resetToken) {
      const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000"
      await sendEmail({
        to: payload.email,
        subject: "Reset your PayFlow password",
        html: passwordResetHtml({
          resetUrl: `${APP_URL}/reset-password?token=${payload.resetToken}`,
          expiresAt: payload.expiresAt ?? "",
        }),
      })
    }
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
