import { createHash } from "crypto"
import { db } from "../lib/db.js"

// Thresholds — intentionally explicit so buyers can tune them
const RULES = {
  maxFailuresPerEmail: Number(process.env["FRAUD_MAX_FAILURES_EMAIL"] ?? 5),
  emailWindowMs:       Number(process.env["FRAUD_EMAIL_WINDOW_MS"]    ?? 10 * 60 * 1000), // 10 min
  maxAttemptsPerIp:    Number(process.env["FRAUD_MAX_ATTEMPTS_IP"]    ?? 10),
  ipWindowMs:          Number(process.env["FRAUD_IP_WINDOW_MS"]       ?? 60 * 1000),       // 1 min
} as const

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex")
}

interface FraudCheck {
  merchantId: string
  email: string
  ip: string
  userAgent?: string
  amount: number
  currency: string
  provider: string
}

interface FraudResult {
  blocked: boolean
  reason?: string
}

export async function checkFraud(input: FraudCheck): Promise<FraudResult> {
  const emailHash = hashEmail(input.email)
  const emailWindowStart = new Date(Date.now() - RULES.emailWindowMs)
  const ipWindowStart    = new Date(Date.now() - RULES.ipWindowMs)

  // Run both checks in parallel — fail fast if either is over threshold
  const [emailFailures, ipAttempts] = await Promise.all([
    db.paymentAttempt.count({
      where: {
        merchantId: input.merchantId,
        emailHash,
        status: "failed",
        createdAt: { gte: emailWindowStart },
      },
    }),
    db.paymentAttempt.count({
      where: {
        merchantId: input.merchantId,
        ip: input.ip,
        createdAt: { gte: ipWindowStart },
      },
    }),
  ])

  if (emailFailures >= RULES.maxFailuresPerEmail) {
    return { blocked: true, reason: "too_many_failures_email" }
  }
  if (ipAttempts >= RULES.maxAttemptsPerIp) {
    return { blocked: true, reason: "too_many_attempts_ip" }
  }

  return { blocked: false }
}

export async function recordAttempt(
  input: FraudCheck & { paymentId?: string; status: "success" | "failed" | "blocked"; blockReason?: string }
): Promise<void> {
  await db.paymentAttempt.create({
    data: {
      merchantId: input.merchantId,
      paymentId:  input.paymentId ?? null,
      emailHash:  hashEmail(input.email),
      ip:         input.ip,
      userAgent:  input.userAgent ?? null,
      status:     input.status,
      amount:     input.amount,
      currency:   input.currency,
      provider:   input.provider,
      blockReason: input.blockReason ?? null,
    },
  })
}
