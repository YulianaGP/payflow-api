import { SubscriptionStatus } from "@prisma/client"
import { createHash } from "node:crypto"
import { db } from "../lib/db.js"
import { transitionSubscription } from "./subscriptionService.js"

// ─── Idempotency ─────────────────────────────────────────────────────────────

// Two-layer idempotency for subscription renewal webhooks:
// Layer 1: providerEventId stored in PaymentEvent (@@unique([provider, externalEventId]))
// Layer 2: hash of (subscriptionId + periodStart) stored as Payment.idempotencyKey

function renewalIdempotencyKey(subscriptionId: string, periodStart: Date): string {
  return createHash("sha256")
    .update(`renewal:${subscriptionId}:${periodStart.toISOString()}`)
    .digest("hex")
}

// ─── Renewal (invoice.payment_succeeded / preapproval authorized) ─────────────

export async function processRenewalSuccess(params: {
  subscriptionId: string
  providerEventId: string
  provider: string
  amountPaid: number
  newPeriodStart: Date
  newPeriodEnd: Date
}): Promise<{ processed: boolean; reason: string }> {
  const { subscriptionId, providerEventId, provider, amountPaid, newPeriodStart, newPeriodEnd } = params

  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } })
  if (!subscription) return { processed: false, reason: "subscription_not_found" }

  // Layer 2 idempotency check
  const idempotencyKey = renewalIdempotencyKey(subscriptionId, newPeriodStart)
  const existingPayment = await db.payment.findFirst({ where: { idempotencyKey } })
  if (existingPayment) return { processed: false, reason: "already_processed" }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: newPeriodEnd,
        firstPaymentFailureAt: null,
        lastDunningAttemptAt: null,
        nextDunningAttemptAt: null,
        gracePeriodEndsAt: null,
      },
    })

    // Transition to ACTIVE if coming from PAST_DUE; no-op if already ACTIVE
    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      await transitionSubscription(
        tx,
        { id: subscriptionId, status: subscription.status, merchantId: subscription.merchantId },
        SubscriptionStatus.ACTIVE,
        `webhook:${provider}`,
        { providerEventId, reason: "renewal_success" }
      )
    }

    // Payment record for financial audit trail
    await tx.payment.create({
      data: {
        merchantId: subscription.merchantId,
        orderId: `renewal_${subscriptionId}_${newPeriodStart.getTime()}`,
        amount: amountPaid,
        currency: subscription.currency,
        provider,
        status: "SUCCESS",
        subscriptionId,
        idempotencyKey,
        externalId: providerEventId,
      },
    })
  })

  return { processed: true, reason: "renewal_success" }
}

// ─── Payment failed (invoice.payment_failed) ──────────────────────────────────

export async function processRenewalFailure(params: {
  subscriptionId: string
  providerEventId: string
  provider: string
}): Promise<{ processed: boolean; reason: string }> {
  const { subscriptionId, providerEventId, provider } = params

  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } })
  if (!subscription) return { processed: false, reason: "subscription_not_found" }
  if (subscription.status === SubscriptionStatus.CANCELED) return { processed: false, reason: "already_canceled" }

  const now = new Date()
  const firstFailure = subscription.firstPaymentFailureAt ?? now
  const gracePeriodEnd = new Date(firstFailure)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 14)

  const nextAttempt = new Date(now)
  nextAttempt.setDate(nextAttempt.getDate() + 1)

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        firstPaymentFailureAt: subscription.firstPaymentFailureAt ?? now,
        lastDunningAttemptAt: now,
        nextDunningAttemptAt: nextAttempt,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt ?? gracePeriodEnd,
      },
    })

    if (subscription.status !== SubscriptionStatus.PAST_DUE) {
      await transitionSubscription(
        tx,
        { id: subscriptionId, status: subscription.status, merchantId: subscription.merchantId },
        SubscriptionStatus.PAST_DUE,
        `webhook:${provider}`,
        { providerEventId, reason: "payment_failed" }
      )
    }
  })

  return { processed: true, reason: "marked_past_due" }
}

// ─── External cancellation (customer.subscription.deleted / preapproval cancelled) ───

export async function processExternalCancellation(params: {
  subscriptionId: string
  providerEventId: string
  provider: string
}): Promise<{ processed: boolean; reason: string }> {
  const { subscriptionId, providerEventId, provider } = params

  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } })
  if (!subscription) return { processed: false, reason: "subscription_not_found" }
  if (subscription.status === SubscriptionStatus.CANCELED) return { processed: false, reason: "already_canceled" }

  await db.$transaction(async (tx) => {
    await transitionSubscription(
      tx,
      { id: subscriptionId, status: subscription.status, merchantId: subscription.merchantId },
      SubscriptionStatus.CANCELED,
      `webhook:${provider}`,
      { providerEventId, reason: "external_cancellation" }
    )
  })

  return { processed: true, reason: "canceled_externally" }
}

// ─── Provider-specific event routing ─────────────────────────────────────────
//
// Stripe subscription event shapes (inject Stripe.Event from stripe library):
//   "invoice.payment_succeeded" → event.data.object.subscription (subscriptionId)
//   "invoice.payment_failed"    → event.data.object.subscription
//   "customer.subscription.deleted" → event.data.object.id
//
// MercadoPago preapproval shapes:
//   body.type === "preapproval" && body.action === "updated"
//   body.data.id → fetch preapproval from MP API to get status
//   status "authorized" → renewal success
//   status "cancelled"  → external cancellation
//
// Both providers: look up the Subscription by externalId to get subscriptionId.
// This lookup is the bridge between the provider's ID and our internal ID.
//
// Example (Stripe):
//   const stripeSubscriptionId = invoice.subscription as string
//   const sub = await db.subscription.findFirst({ where: { externalId: stripeSubscriptionId } })
//   if (!sub) return { processed: false, reason: "unknown_subscription" }
//   return processRenewalSuccess({ subscriptionId: sub.id, ... })
