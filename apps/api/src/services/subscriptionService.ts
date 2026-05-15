import { SubscriptionStatus, type Prisma } from "@prisma/client"
import { db } from "../lib/db.js"
import { resolveProvider } from "./providerResolver.js"

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class SubscriptionNotFoundError extends Error {
  readonly code = "SUBSCRIPTION_NOT_FOUND"
  constructor(id: string) {
    super(`Subscription ${id} not found`)
    this.name = "SubscriptionNotFoundError"
  }
}

export class SubscriptionAlreadyActiveError extends Error {
  readonly code = "SUBSCRIPTION_ALREADY_ACTIVE"
  constructor() {
    super("An active subscription already exists for this plan")
    this.name = "SubscriptionAlreadyActiveError"
  }
}

export class SubscriptionCanceledError extends Error {
  readonly code = "SUBSCRIPTION_CANCELED"
  constructor() {
    super("Cannot modify a canceled subscription")
    this.name = "SubscriptionCanceledError"
  }
}

export class PlanNotFoundError extends Error {
  readonly code = "PLAN_NOT_FOUND"
  constructor(id: string) {
    super(`Plan ${id} not found`)
    this.name = "PlanNotFoundError"
  }
}

export class CrossMerchantError extends Error {
  readonly code = "CROSS_MERCHANT"
  constructor() {
    super("Plan does not belong to this merchant")
    this.name = "CrossMerchantError"
  }
}

// ─── State machine ────────────────────────────────────────────────────────────

// Valid transitions — keys are (from → to). Everything else is forbidden.
const VALID_TRANSITIONS: Partial<Record<SubscriptionStatus, SubscriptionStatus[]>> = {
  [SubscriptionStatus.TRIALING]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
  ],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELED,
  ],
  // CANCELED and PAUSED are terminal — no outgoing transitions
}

type SubscriptionShape = { id: string; status: SubscriptionStatus; merchantId: string }

// Single gated function for all status changes.
// Callers must go through this — never update status directly.
// Invariant: every status change creates a SubscriptionAuditLog + OutboxEvent
// in the same $transaction.
export async function transitionSubscription(
  tx: Prisma.TransactionClient,
  subscription: SubscriptionShape,
  to: SubscriptionStatus,
  changedBy: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const allowed = VALID_TRANSITIONS[subscription.status] ?? []
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid subscription transition: ${subscription.status} → ${to}`
    )
  }

  await tx.subscription.update({
    where: { id: subscription.id },
    data: { status: to },
  })

  await tx.subscriptionAuditLog.create({
    data: {
      subscriptionId: subscription.id,
      fromStatus: subscription.status,
      toStatus: to,
      changedBy,
      metadata,
    },
  })

  await tx.outboxEvent.create({
    data: {
      type: `subscription.${to.toLowerCase()}`,
      category: "subscription",
      payload: {
        subscriptionId: subscription.id,
        merchantId: subscription.merchantId,
        fromStatus: subscription.status,
        toStatus: to,
        changedBy,
        ...metadata,
      },
    },
  })
}

// ─── Plan management ──────────────────────────────────────────────────────────

export async function createPlan(
  merchantId: string,
  input: {
    name: string
    description?: string
    price: number
    currency: string
    interval: string
    intervalCount: number
    trialDays: number
  }
) {
  return db.plan.create({
    data: {
      merchantId,
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      interval: input.interval,
      intervalCount: input.intervalCount,
      trialDays: input.trialDays,
    },
  })
}

export async function listPlans(merchantId: string, onlyActive = true) {
  return db.plan.findMany({
    where: { merchantId, ...(onlyActive ? { isActive: true } : {}) },
    orderBy: { price: "asc" },
  })
}

export async function getPlan(id: string, merchantId: string) {
  const plan = await db.plan.findFirst({ where: { id, merchantId } })
  if (!plan) throw new PlanNotFoundError(id)
  return plan
}

// ─── Subscription creation ────────────────────────────────────────────────────

export async function createSubscription(
  planId: string,
  context: { userId: string; merchantId: string }
) {
  // 1. Verify plan exists and belongs to this merchant
  const plan = await db.plan.findFirst({
    where: { id: planId, isActive: true },
  })
  if (!plan) throw new PlanNotFoundError(planId)
  if (plan.merchantId !== context.merchantId) throw new CrossMerchantError()

  // 2. Idempotency: return existing active/trialing subscription for this (user, plan)
  const existing = await db.subscription.findFirst({
    where: {
      userId: context.userId,
      planId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] },
    },
  })
  if (existing) throw new SubscriptionAlreadyActiveError()

  // 3. Anti-trial abuse: no trial if user already had this plan and canceled it
  const hasCanceled = await db.subscription.findFirst({
    where: {
      userId: context.userId,
      planId,
      status: SubscriptionStatus.CANCELED,
    },
  })
  const effectiveTrialDays = hasCanceled ? 0 : plan.trialDays

  // 4. Calculate period dates
  const now = new Date()
  const periodEnd = new Date(now)
  if (plan.interval === "year") {
    periodEnd.setFullYear(periodEnd.getFullYear() + plan.intervalCount)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + plan.intervalCount)
  }

  const trialEndsAt =
    effectiveTrialDays > 0
      ? new Date(now.getTime() + effectiveTrialDays * 24 * 60 * 60 * 1000)
      : null

  const initialStatus =
    effectiveTrialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE

  // 5. Register with provider (mock for now — real provider integration in Day 23)
  const provider = resolveProvider(plan.merchantId as any)
  let externalId: string | null = null
  try {
    // Provider creates a recurring billing agreement / preapproval
    const result = await (provider as any).createSubscription?.({
      planId: plan.id,
      userId: context.userId,
      amount: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      intervalCount: plan.intervalCount,
      trialDays: effectiveTrialDays,
    })
    externalId = result?.externalRef ?? null
  } catch {
    // Provider subscription creation is best-effort for now.
    // If it fails, the subscription is still created locally.
    // Reconciliation will detect the mismatch.
  }

  // 6. Persist subscription + initial audit log + outbox (atomic)
  const subscription = await db.$transaction(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        merchantId: context.merchantId,
        userId: context.userId,
        planId,
        status: initialStatus,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt ?? periodEnd,
        trialEndsAt,
        unitPrice: plan.price,
        currency: plan.currency,
        provider: "mock", // resolved dynamically; placeholder until merchant lookup is wired
        externalId,
      },
      include: { plan: { select: { name: true } } },
    })

    await tx.subscriptionAuditLog.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: "NONE",
        toStatus: initialStatus,
        changedBy: `user:${context.userId}`,
        metadata: {
          planId,
          planName: sub.plan.name,
          unitPrice: plan.price,
          currency: plan.currency,
          trialDays: effectiveTrialDays,
        },
      },
    })

    await tx.outboxEvent.create({
      data: {
        type: "subscription.created",
        category: "subscription",
        payload: {
          subscriptionId: sub.id,
          merchantId: context.merchantId,
          userId: context.userId,
          planId,
          planName: sub.plan.name,
          status: initialStatus,
          unitPrice: plan.price,
          currency: plan.currency,
          trialDays: effectiveTrialDays,
          currentPeriodEnd: (trialEndsAt ?? periodEnd).toISOString(),
        },
      },
    })

    return sub
  })

  return subscription
}

// ─── Subscription cancellation ────────────────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string,
  context: { userId: string; merchantId: string }
) {
  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId, merchantId: context.merchantId, userId: context.userId },
  })

  if (!subscription) throw new SubscriptionNotFoundError(subscriptionId)
  if (subscription.status === SubscriptionStatus.CANCELED) {
    throw new SubscriptionCanceledError()
  }

  // Policy: cancel only at end of period — no immediate cancellation.
  // This eliminates edge cases around refunds and access loss.
  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: true },
    })

    await tx.subscriptionAuditLog.create({
      data: {
        subscriptionId,
        fromStatus: subscription.status,
        toStatus: subscription.status, // status unchanged — cancelAtPeriodEnd is the flag
        changedBy: `user:${context.userId}`,
        metadata: {
          action: "cancel_at_period_end",
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        },
      },
    })

    await tx.outboxEvent.create({
      data: {
        type: "subscription.cancel_scheduled",
        category: "subscription",
        payload: {
          subscriptionId,
          merchantId: context.merchantId,
          userId: context.userId,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        },
      },
    })
  })

  return db.subscription.findUnique({ where: { id: subscriptionId } })
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getSubscription(id: string, context: { userId: string; merchantId: string; role: string }) {
  const where = context.role === "ADMIN"
    ? { id, merchantId: context.merchantId }
    : { id, merchantId: context.merchantId, userId: context.userId }

  const subscription = await db.subscription.findFirst({
    where,
    include: {
      plan: { select: { name: true, interval: true, intervalCount: true } },
    },
  })

  if (!subscription) throw new SubscriptionNotFoundError(id)
  return subscription
}

export async function listSubscriptions(context: { userId: string; merchantId: string; role: string }) {
  const where = context.role === "ADMIN"
    ? { merchantId: context.merchantId }
    : { userId: context.userId, merchantId: context.merchantId }

  return db.subscription.findMany({
    where,
    include: { plan: { select: { name: true, interval: true, intervalCount: true } } },
    orderBy: { createdAt: "desc" },
  })
}

// ─── Plan change (upgrade / downgrade) ───────────────────────────────────────

export class SubscriptionCurrencyMismatchError extends Error {
  readonly code = "CURRENCY_MISMATCH"
  constructor(from: string, to: string) {
    super(`Cannot change plan: currency mismatch (${from} → ${to})`)
    this.name = "SubscriptionCurrencyMismatchError"
  }
}

export interface PlanChangePreview {
  currentPlan: { id: string; name: string; price: number }
  newPlan: { id: string; name: string; price: number }
  daysRemaining: number
  daysInPeriod: number
  creditCents: number
  chargeCents: number
  creditBalanceCents: number
  netChargeCents: number
  appliedNextPeriod: boolean
}

type ProrationResult = Omit<PlanChangePreview, "currentPlan" | "newPlan" | "creditBalanceCents">

function calculateProration(
  subscription: { unitPrice: number; currentPeriodStart: Date; currentPeriodEnd: Date },
  newPlan: { price: number }
): ProrationResult {
  const now = new Date()
  const daysRemaining = Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - now.getTime()) / 86_400_000))
  const daysInPeriod = Math.max(1, Math.ceil((subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) / 86_400_000))

  if (daysRemaining <= 1) {
    return { daysRemaining, daysInPeriod, creditCents: 0, chargeCents: 0, netChargeCents: 0, appliedNextPeriod: true }
  }

  const creditCents = Math.floor((subscription.unitPrice * daysRemaining) / daysInPeriod)
  const chargeCents = Math.floor((newPlan.price * daysRemaining) / daysInPeriod)
  const netChargeCents = Math.max(0, chargeCents - creditCents)

  return { daysRemaining, daysInPeriod, creditCents, chargeCents, netChargeCents, appliedNextPeriod: false }
}

export async function previewPlanChange(
  subscriptionId: string,
  newPlanId: string,
  context: { userId: string; merchantId: string }
): Promise<PlanChangePreview> {
  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId, merchantId: context.merchantId, userId: context.userId },
    include: { plan: { select: { id: true, name: true } } },
  })
  if (!subscription) throw new SubscriptionNotFoundError(subscriptionId)
  if (subscription.status === SubscriptionStatus.CANCELED) throw new SubscriptionCanceledError()

  const newPlan = await db.plan.findFirst({ where: { id: newPlanId, isActive: true } })
  if (!newPlan) throw new PlanNotFoundError(newPlanId)
  if (newPlan.merchantId !== context.merchantId) throw new CrossMerchantError()
  if (newPlan.currency !== subscription.currency) {
    throw new SubscriptionCurrencyMismatchError(subscription.currency, newPlan.currency)
  }

  const proration = calculateProration(subscription, newPlan)

  return {
    currentPlan: { id: subscription.planId, name: subscription.plan.name, price: subscription.unitPrice },
    newPlan: { id: newPlan.id, name: newPlan.name, price: newPlan.price },
    creditBalanceCents: subscription.creditBalance,
    ...proration,
  }
}

export async function changePlan(
  subscriptionId: string,
  newPlanId: string,
  context: { userId: string; merchantId: string }
) {
  // 1. Verify ownership and current status
  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId, merchantId: context.merchantId, userId: context.userId },
    include: { plan: { select: { id: true, name: true } } },
  })
  if (!subscription) throw new SubscriptionNotFoundError(subscriptionId)
  if (subscription.status === SubscriptionStatus.CANCELED) throw new SubscriptionCanceledError()

  // 2. Verify new plan belongs to this merchant
  const newPlan = await db.plan.findFirst({ where: { id: newPlanId, isActive: true } })
  if (!newPlan) throw new PlanNotFoundError(newPlanId)
  if (newPlan.merchantId !== context.merchantId) throw new CrossMerchantError()
  if (newPlan.currency !== subscription.currency) {
    throw new SubscriptionCurrencyMismatchError(subscription.currency, newPlan.currency)
  }

  // Idempotency: already on this plan
  if (subscription.planId === newPlanId) {
    return db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: { select: { name: true, interval: true, intervalCount: true } } },
    })
  }

  // 3. Calculate proration (server-side — never trust client values)
  const proration = calculateProration(subscription, newPlan)
  const effectiveCredit = proration.creditCents + subscription.creditBalance

  // 4. If net charge needed: call provider OUTSIDE the transaction.
  //    If provider fails → do not change plan, surface the error.
  if (proration.netChargeCents > 0 && !proration.appliedNextPeriod) {
    const provider = resolveProvider(subscription.provider as any)
    try {
      await (provider as any).charge?.({
        externalId: subscription.externalId,
        amount: proration.netChargeCents,
        currency: subscription.currency,
        description: `Plan upgrade: ${subscription.plan.name} → ${newPlan.name}`,
      })
    } catch {
      throw new Error("Payment failed — your current plan remains unchanged")
    }
  }

  // 5. Atomic DB update: subscription + audit log + outbox + optional payment record
  const newCreditBalance = proration.appliedNextPeriod
    ? subscription.creditBalance
    : Math.max(0, effectiveCredit - proration.chargeCents)

  return db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { planId: newPlanId, unitPrice: newPlan.price, creditBalance: newCreditBalance },
    })

    await tx.subscriptionAuditLog.create({
      data: {
        subscriptionId,
        fromStatus: subscription.status,
        toStatus: subscription.status,
        changedBy: `user:${context.userId}`,
        metadata: {
          action: "plan_change",
          fromPlanId: subscription.planId,
          fromPlanName: subscription.plan.name,
          toPlanId: newPlanId,
          toPlanName: newPlan.name,
          creditCents: proration.creditCents,
          chargeCents: proration.chargeCents,
          netChargeCents: proration.netChargeCents,
          appliedNextPeriod: proration.appliedNextPeriod,
        },
      },
    })

    await tx.outboxEvent.create({
      data: {
        type: "subscription.plan_changed",
        category: "subscription",
        payload: {
          subscriptionId,
          merchantId: context.merchantId,
          userId: context.userId,
          fromPlanId: subscription.planId,
          fromPlanName: subscription.plan.name,
          toPlanId: newPlanId,
          toPlanName: newPlan.name,
          netChargeCents: proration.netChargeCents,
          appliedNextPeriod: proration.appliedNextPeriod,
        },
      },
    })

    // Create Payment record for the proration charge (financial audit trail)
    if (proration.netChargeCents > 0 && !proration.appliedNextPeriod) {
      await tx.payment.create({
        data: {
          merchantId: context.merchantId,
          orderId: `sub_change_${subscriptionId}_${Date.now()}`,
          amount: proration.netChargeCents,
          currency: subscription.currency,
          provider: subscription.provider,
          status: "SUCCESS",
          subscriptionId,
        },
      })
    }

    return tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: { select: { name: true, interval: true, intervalCount: true } } },
    })
  })
}
