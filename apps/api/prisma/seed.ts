import { PrismaClient, PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client"
import { createHash } from "crypto"

const db = new PrismaClient()

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function cents(dollars: number): number {
  return Math.round(dollars * 100)
}

async function main(): Promise<void> {
  console.log("🌱 Seeding database...")

  // ── Clean existing data (order matters for FK constraints) ──────────────
  await db.statusCheck.deleteMany()
  await db.invoice.deleteMany()
  await db.webhookDelivery.deleteMany()
  await db.webhook.deleteMany()
  await db.dispute.deleteMany()
  await db.paymentAttempt.deleteMany()
  await db.paymentAuditLog.deleteMany()
  await db.paymentEvent.deleteMany()
  await db.deadLetterEvent.deleteMany()
  await db.outboxEvent.deleteMany()
  await db.payment.deleteMany()
  await db.subscription.deleteMany()
  await db.plan.deleteMany()
  await db.apiKey.deleteMany()
  await db.twoFactorAuth.deleteMany()
  await db.revokedSession.deleteMany()
  await db.userConsent.deleteMany()
  await db.user.deleteMany()
  await db.merchant.deleteMany()

  // ── Merchants ────────────────────────────────────────────────────────────
  const merchantMP = await db.merchant.create({
    data: {
      name: "Tienda Demo (MercadoPago)",
      paymentProvider: "mercadopago",
      currency: "ARS",
      webhookSecret: sha256("mp-webhook-secret-demo"),
      refundWindowDays: 180,
    },
  })

  const merchantStripe = await db.merchant.create({
    data: {
      name: "Demo Store (Stripe)",
      paymentProvider: "stripe",
      currency: "USD",
      webhookSecret: sha256("stripe-webhook-secret-demo"),
      refundWindowDays: 365,
    },
  })

  // ── Users (5 per merchant) ───────────────────────────────────────────────
  const usersMP = await Promise.all([
    db.user.create({
      data: {
        email: "admin@tiendademo.com",
        name: "Admin Demo",
        passwordHash: sha256("password123"),
        role: UserRole.ADMIN,
        merchantId: merchantMP.id,
      },
    }),
    db.user.create({
      data: {
        email: "user1@tiendademo.com",
        name: "Usuario Uno",
        passwordHash: sha256("password123"),
        merchantId: merchantMP.id,
      },
    }),
    db.user.create({
      data: {
        email: "user2@tiendademo.com",
        name: "Usuario Dos",
        passwordHash: sha256("password123"),
        merchantId: merchantMP.id,
      },
    }),
    db.user.create({
      data: {
        email: "user3@tiendademo.com",
        name: "Usuario Tres",
        passwordHash: sha256("password123"),
        merchantId: merchantMP.id,
      },
    }),
    db.user.create({
      data: {
        email: "user4@tiendademo.com",
        name: "Usuario Cuatro",
        passwordHash: sha256("password123"),
        merchantId: merchantMP.id,
      },
    }),
  ])

  const usersStripe = await Promise.all([
    db.user.create({
      data: {
        email: "admin@demostore.com",
        name: "Store Admin",
        passwordHash: sha256("password123"),
        role: UserRole.ADMIN,
        merchantId: merchantStripe.id,
      },
    }),
    db.user.create({
      data: {
        email: "customer1@demostore.com",
        name: "Customer One",
        passwordHash: sha256("password123"),
        merchantId: merchantStripe.id,
      },
    }),
    db.user.create({
      data: {
        email: "customer2@demostore.com",
        name: "Customer Two",
        passwordHash: sha256("password123"),
        merchantId: merchantStripe.id,
      },
    }),
    db.user.create({
      data: {
        email: "customer3@demostore.com",
        name: "Customer Three",
        passwordHash: sha256("password123"),
        merchantId: merchantStripe.id,
      },
    }),
    db.user.create({
      data: {
        email: "customer4@demostore.com",
        name: "Customer Four",
        passwordHash: sha256("password123"),
        merchantId: merchantStripe.id,
      },
    }),
  ])

  // ── UserConsent for all users ─────────────────────────────────────────────
  const allUsers = [...usersMP, ...usersStripe]
  await Promise.all(
    allUsers.map((user) =>
      db.userConsent.create({
        data: {
          userId: user.id,
          ipAddress: "127.0.0.1",
          userAgent: "seed/1.0",
          version: "1.0",
        },
      })
    )
  )

  // ── API Keys ──────────────────────────────────────────────────────────────
  await db.apiKey.create({
    data: {
      userId: usersMP[0]!.id,
      keyHash: sha256("pk_test_mp_admin_key_demo"),
      prefix: "pk_test_",
      name: "Test Key — MercadoPago Admin",
    },
  })
  await db.apiKey.create({
    data: {
      userId: usersStripe[0]!.id,
      keyHash: sha256("pk_test_stripe_admin_key_demo"),
      prefix: "pk_test_",
      name: "Test Key — Stripe Admin",
    },
  })

  // ── Plans ─────────────────────────────────────────────────────────────────
  const basicPlan = await db.plan.create({
    data: {
      merchantId: merchantMP.id,
      name: "Basic",
      description: "Perfect for getting started",
      price: cents(9),
      currency: "ARS",
      interval: "month",
      trialDays: 7,
    },
  })

  const proPlan = await db.plan.create({
    data: {
      merchantId: merchantMP.id,
      name: "Pro",
      description: "For growing businesses",
      price: cents(29),
      currency: "ARS",
      interval: "month",
      trialDays: 14,
    },
  })

  const enterprisePlan = await db.plan.create({
    data: {
      merchantId: merchantStripe.id,
      name: "Enterprise",
      description: "For large teams",
      price: cents(99),
      currency: "USD",
      interval: "month",
      trialDays: 0,
    },
  })

  // ── Payments (10 total, different statuses) ───────────────────────────────
  const paymentData: Array<{
    merchantId: string
    orderId: string
    status: PaymentStatus
    amount: number
    currency: string
    provider: string
    externalId?: string
  }> = [
    { merchantId: merchantMP.id, orderId: "order-001", status: PaymentStatus.SUCCESS, amount: cents(150), currency: "ARS", provider: "mercadopago", externalId: "mp_pay_001" },
    { merchantId: merchantMP.id, orderId: "order-002", status: PaymentStatus.SUCCESS, amount: cents(299), currency: "ARS", provider: "mercadopago", externalId: "mp_pay_002" },
    { merchantId: merchantMP.id, orderId: "order-003", status: PaymentStatus.FAILED,  amount: cents(500), currency: "ARS", provider: "mercadopago", externalId: "mp_pay_003" },
    { merchantId: merchantMP.id, orderId: "order-004", status: PaymentStatus.PENDING, amount: cents(75),  currency: "ARS", provider: "mercadopago" },
    { merchantId: merchantMP.id, orderId: "order-005", status: PaymentStatus.REFUNDED, amount: cents(150), currency: "ARS", provider: "mercadopago", externalId: "mp_pay_005" },
    { merchantId: merchantStripe.id, orderId: "order-006", status: PaymentStatus.SUCCESS,  amount: cents(49),  currency: "USD", provider: "stripe", externalId: "pi_stripe_006" },
    { merchantId: merchantStripe.id, orderId: "order-007", status: PaymentStatus.SUCCESS,  amount: cents(99),  currency: "USD", provider: "stripe", externalId: "pi_stripe_007" },
    { merchantId: merchantStripe.id, orderId: "order-008", status: PaymentStatus.PROCESSING, amount: cents(199), currency: "USD", provider: "stripe", externalId: "pi_stripe_008" },
    { merchantId: merchantStripe.id, orderId: "order-009", status: PaymentStatus.FAILED,   amount: cents(29),  currency: "USD", provider: "stripe", externalId: "pi_stripe_009" },
    { merchantId: merchantStripe.id, orderId: "order-010", status: PaymentStatus.DISPUTED, amount: cents(99),  currency: "USD", provider: "stripe", externalId: "pi_stripe_010" },
  ]

  const payments = await Promise.all(
    paymentData.map((data) => db.payment.create({ data }))
  )

  // ── Audit logs for each payment ───────────────────────────────────────────
  await Promise.all(
    payments.map((payment) =>
      db.paymentAuditLog.create({
        data: {
          paymentId: payment.id,
          fromStatus: "PENDING",
          toStatus: payment.status,
          changedBy: payment.status === "PENDING" ? "system" : "webhook",
          metadata: { ip: "0.0.0.0", provider: payment.provider },
        },
      })
    )
  )

  // ── Dispute for the DISPUTED payment ─────────────────────────────────────
  const disputedPayment = payments.find((p) => p.status === PaymentStatus.DISPUTED)
  if (disputedPayment) {
    await db.dispute.create({
      data: {
        paymentId: disputedPayment.id,
        merchantId: merchantStripe.id,
        externalId: "dp_stripe_001",
        status: "needs_response",
        reason: "fraudulent",
        amount: disputedPayment.amount,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    })
  }

  // ── Subscriptions (3 different statuses) ─────────────────────────────────
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

  await db.subscription.create({
    data: {
      merchantId: merchantMP.id,
      userId: usersMP[1]!.id,
      planId: proPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: lastMonth,
      currentPeriodEnd: nextMonth,
      provider: "mercadopago",
      externalId: "mp_sub_001",
    },
  })

  await db.subscription.create({
    data: {
      merchantId: merchantMP.id,
      userId: usersMP[2]!.id,
      planId: basicPlan.id,
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodStart: lastMonth,
      currentPeriodEnd: now,
      failedPaymentCount: 2,
      gracePeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      provider: "mercadopago",
      externalId: "mp_sub_002",
    },
  })

  await db.subscription.create({
    data: {
      merchantId: merchantStripe.id,
      userId: usersStripe[1]!.id,
      planId: enterprisePlan.id,
      status: SubscriptionStatus.CANCELED,
      currentPeriodStart: lastMonth,
      currentPeriodEnd: lastMonth,
      cancelAtPeriodEnd: false,
      provider: "stripe",
      externalId: "sub_stripe_001",
    },
  })

  // ── Payment attempts (fraud detection history) ────────────────────────────
  await Promise.all([
    db.paymentAttempt.create({
      data: {
        merchantId: merchantMP.id,
        emailHash: sha256("test@example.com"),
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        status: "success",
        amount: cents(150),
        currency: "ARS",
        provider: "mercadopago",
      },
    }),
    db.paymentAttempt.create({
      data: {
        merchantId: merchantMP.id,
        emailHash: sha256("fraud@bad.com"),
        ip: "10.0.0.1",
        status: "blocked",
        amount: cents(1),
        currency: "ARS",
        provider: "mercadopago",
        blockReason: "suspicious_amount",
      },
    }),
    db.paymentAttempt.create({
      data: {
        merchantId: merchantStripe.id,
        emailHash: sha256("retry@example.com"),
        ip: "192.168.2.2",
        status: "failed",
        amount: cents(99),
        currency: "USD",
        provider: "stripe",
      },
    }),
  ])

  // ── Webhook ───────────────────────────────────────────────────────────────
  await db.webhook.create({
    data: {
      merchantId: merchantMP.id,
      url: "https://example.com/webhooks/payflow",
      secret: sha256("webhook-delivery-secret"),
      events: ["payment.success", "payment.failed", "subscription.renewed"],
    },
  })

  // ── Invoice (unpaid — pay by link) ────────────────────────────────────────
  await db.invoice.create({
    data: {
      merchantId: merchantMP.id,
      amount: cents(500),
      currency: "ARS",
      description: "Logo design — 2 concepts",
      items: [{ name: "Logo design", quantity: 1, unitPrice: cents(500) }],
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  // ── Status checks ─────────────────────────────────────────────────────────
  await Promise.all(
    ["api", "database", "redis", "mercadopago", "stripe"].map((service) =>
      db.statusCheck.create({
        data: {
          service,
          status: "operational",
          latencyMs: Math.floor(Math.random() * 100) + 10,
        },
      })
    )
  )

  console.log("✅ Seed complete:")
  console.log(`   2 merchants, ${allUsers.length} users, 10 payments`)
  console.log(`   3 subscriptions, 3 plans, 1 dispute, 1 invoice`)
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
