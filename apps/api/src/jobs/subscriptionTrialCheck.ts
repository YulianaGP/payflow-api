import { SubscriptionStatus } from "@prisma/client"
import { db } from "../lib/db.js"
import { transitionSubscription } from "../services/subscriptionService.js"

// Runs hourly. Finds TRIALING subscriptions whose trial has expired and
// advances them to ACTIVE. This is the only place that drives TRIALING → ACTIVE.
export async function runTrialCheck(): Promise<void> {
  const now = new Date()

  const expired = await db.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { lte: now },
    },
    select: { id: true, status: true, merchantId: true, currentPeriodEnd: true },
  })

  if (expired.length === 0) return

  process.stdout.write(`[trial-check] ${expired.length} trial(s) expired — advancing to ACTIVE\n`)

  for (const sub of expired) {
    try {
      await db.$transaction(async (tx) => {
        // Extend period: trial ended, real billing cycle starts now
        const newPeriodEnd = new Date(now)
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1) // default: 1 month; plan interval resolved in Day 23

        await tx.subscription.update({
          where: { id: sub.id },
          data: { currentPeriodStart: now, currentPeriodEnd: newPeriodEnd },
        })

        await transitionSubscription(
          tx,
          { id: sub.id, status: sub.status, merchantId: sub.merchantId },
          SubscriptionStatus.ACTIVE,
          "system:trial-check",
          { trialExpiredAt: now.toISOString() }
        )
      })

      process.stdout.write(`[trial-check] subscription ${sub.id} → ACTIVE\n`)
    } catch (err) {
      process.stderr.write(
        `[trial-check] failed for ${sub.id}: ${err instanceof Error ? err.message : String(err)}\n`
      )
    }
  }
}

export function startTrialCheckJob(): void {
  const INTERVAL_MS = 60 * 60 * 1000 // 1 hour

  const tick = () => {
    runTrialCheck().catch((err) => {
      process.stderr.write(
        `[trial-check] job error: ${err instanceof Error ? err.message : String(err)}\n`
      )
    })
  }

  tick() // run immediately on start
  setInterval(tick, INTERVAL_MS)
  process.stdout.write("[trial-check] job started (interval: 1h)\n")
}
