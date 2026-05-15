import { SubscriptionStatus } from "@prisma/client"
import { db } from "../lib/db.js"
import { transitionSubscription } from "../services/subscriptionService.js"
import { resolveProvider } from "../services/providerResolver.js"

// Days from firstPaymentFailureAt when we send escalating dunning emails.
// Day 1: silent retry. Day 3: warning email. Day 7: urgent email. Day 14: cancel.
const DUNNING_EMAIL_DAYS = { warning: 3, urgent: 7 }
const GRACE_PERIOD_DAYS = 14

export async function runDunning(): Promise<void> {
  const now = new Date()

  // SELECT FOR UPDATE SKIP LOCKED: concurrent workers skip rows already being processed
  const due = await db.$queryRaw<Array<{
    id: string
    status: SubscriptionStatus
    merchantId: string
    userId: string
    externalId: string | null
    provider: string
    currency: string
    unitPrice: number
    firstPaymentFailureAt: Date | null
    gracePeriodEndsAt: Date | null
  }>>`
    SELECT id, status, "merchantId", "userId", "externalId", provider, currency, "unitPrice",
           "firstPaymentFailureAt", "gracePeriodEndsAt"
    FROM "Subscription"
    WHERE status = 'PAST_DUE'
      AND "nextDunningAttemptAt" IS NOT NULL
      AND "nextDunningAttemptAt" <= NOW()
    FOR UPDATE SKIP LOCKED
  `

  if (due.length === 0) return

  process.stdout.write(`[dunning] processing ${due.length} subscription(s)\n`)

  for (const sub of due) {
    try {
      await processDunning(sub, now)
    } catch (err) {
      process.stderr.write(
        `[dunning] error for ${sub.id}: ${err instanceof Error ? err.message : String(err)}\n`
      )
    }
  }
}

async function processDunning(
  sub: {
    id: string
    status: SubscriptionStatus
    merchantId: string
    userId: string
    externalId: string | null
    provider: string
    currency: string
    unitPrice: number
    firstPaymentFailureAt: Date | null
    gracePeriodEndsAt: Date | null
  },
  now: Date
): Promise<void> {
  // 1. Grace period expired → cancel immediately
  if (sub.gracePeriodEndsAt && sub.gracePeriodEndsAt <= now) {
    await db.$transaction(async (tx) => {
      await transitionSubscription(
        tx,
        { id: sub.id, status: sub.status, merchantId: sub.merchantId },
        SubscriptionStatus.CANCELED,
        "system:dunning",
        { reason: "grace_period_expired", gracePeriodEndsAt: sub.gracePeriodEndsAt!.toISOString() }
      )
      await tx.subscription.update({
        where: { id: sub.id },
        data: { nextDunningAttemptAt: null, gracePeriodEndsAt: null },
      })
      await tx.outboxEvent.create({
        data: {
          type: "subscription.dunning_canceled",
          category: "subscription_email",
          payload: { subscriptionId: sub.id, merchantId: sub.merchantId, userId: sub.userId },
        },
      })
    })
    process.stdout.write(`[dunning] ${sub.id} → CANCELED (grace period expired)\n`)
    return
  }

  // 2. Attempt provider charge
  const provider = resolveProvider(sub.provider as any)
  let chargeSuccess = false
  try {
    await (provider as any).charge?.({
      externalId: sub.externalId,
      amount: sub.unitPrice,
      currency: sub.currency,
    })
    chargeSuccess = true
  } catch {
    chargeSuccess = false
  }

  if (chargeSuccess) {
    // Payment recovered → reset to ACTIVE, clear all dunning state
    const newPeriodEnd = new Date(now)
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1)

    await db.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
          firstPaymentFailureAt: null,
          lastDunningAttemptAt: null,
          nextDunningAttemptAt: null,
          gracePeriodEndsAt: null,
        },
      })
      await transitionSubscription(
        tx,
        { id: sub.id, status: sub.status, merchantId: sub.merchantId },
        SubscriptionStatus.ACTIVE,
        "system:dunning",
        { reason: "payment_recovered" }
      )
      await tx.outboxEvent.create({
        data: {
          type: "subscription.payment_recovered",
          category: "subscription_email",
          payload: { subscriptionId: sub.id, merchantId: sub.merchantId, userId: sub.userId },
        },
      })
    })
    process.stdout.write(`[dunning] ${sub.id} → ACTIVE (payment recovered)\n`)
    return
  }

  // 3. Charge still failing — schedule next attempt based on days since first failure
  const failedDaysSince = sub.firstPaymentFailureAt
    ? Math.floor((now.getTime() - sub.firstPaymentFailureAt.getTime()) / 86_400_000)
    : 0

  // Next attempt: move to next day milestone (1 → 3 → 7 → 14)
  const milestones = [1, DUNNING_EMAIL_DAYS.warning, DUNNING_EMAIL_DAYS.urgent, GRACE_PERIOD_DAYS]
  const nextMilestone = milestones.find((d) => d > failedDaysSince) ?? GRACE_PERIOD_DAYS
  const nextAttempt = new Date(sub.firstPaymentFailureAt ?? now)
  nextAttempt.setDate(nextAttempt.getDate() + nextMilestone)

  const emailType =
    failedDaysSince >= DUNNING_EMAIL_DAYS.urgent
      ? "subscription.dunning_urgent"
      : failedDaysSince >= DUNNING_EMAIL_DAYS.warning
        ? "subscription.dunning_warning"
        : null

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { lastDunningAttemptAt: now, nextDunningAttemptAt: nextAttempt },
    })
    if (emailType) {
      await tx.outboxEvent.create({
        data: {
          type: emailType,
          category: "subscription_email",
          payload: {
            subscriptionId: sub.id,
            merchantId: sub.merchantId,
            userId: sub.userId,
            daysSinceFailure: failedDaysSince,
            gracePeriodEndsAt: sub.gracePeriodEndsAt?.toISOString() ?? null,
          },
        },
      })
    }
  })
  process.stdout.write(
    `[dunning] ${sub.id} charge failed, daysSince=${failedDaysSince}, next=${nextAttempt.toISOString()}\n`
  )
}

export function startDunningJob(): void {
  const INTERVAL_MS = 60 * 60 * 1000 // 1 hour

  const tick = () => {
    runDunning().catch((err) => {
      process.stderr.write(
        `[dunning] job error: ${err instanceof Error ? err.message : String(err)}\n`
      )
    })
  }

  tick()
  setInterval(tick, INTERVAL_MS)
  process.stdout.write("[dunning] job started (interval: 1h)\n")
}
