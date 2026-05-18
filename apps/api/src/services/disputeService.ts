import { db } from "../lib/db.js"
import { sendEmail } from "../lib/email.js"

export interface DisputeEvent {
  provider: string
  externalEventId: string
  paymentExternalId: string
  disputeExternalId: string
  status: string   // 'open' | 'needs_response' | 'won' | 'lost' | 'under_review'
  reason: string
  amount: number
  currency: string
  dueDate: Date | null
  rawPayload: unknown
}

interface DisputeResult {
  processed: boolean
  reason?: string
}

export async function processDisputeEvent(event: DisputeEvent): Promise<DisputeResult> {
  const result = await db.$transaction(async (tx) => {
    // Idempotency — same event ID from provider means we already handled it
    const existing = await tx.paymentEvent.findUnique({
      where: { provider_externalEventId: { provider: event.provider, externalEventId: event.externalEventId } },
    })
    if (existing) return { processed: false, reason: "duplicate_event" }

    // Find the payment by provider's payment ID
    const payment = await tx.payment.findFirst({
      where: { externalId: event.paymentExternalId },
      select: { id: true, merchantId: true, status: true, amount: true, currency: true },
    })
    if (!payment) return { processed: false, reason: "payment_not_found" }

    // Check if dispute already exists (update) vs first time (create)
    const existingDispute = await tx.dispute.findUnique({ where: { paymentId: payment.id } })
    const isNew = !existingDispute

    // Resolve due date — default 7 days from now if provider didn't send one
    const dueDate = event.dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await tx.dispute.upsert({
      where: { paymentId: payment.id },
      update: { status: event.status, updatedAt: new Date() },
      create: {
        paymentId: payment.id,
        merchantId: payment.merchantId,
        externalId: event.disputeExternalId,
        status: event.status,
        reason: event.reason,
        amount: event.amount || payment.amount,
        dueDate,
      },
    })

    // Only move payment to DISPUTED on new disputes, and only from SUCCESS
    if (isNew && payment.status === "SUCCESS") {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "DISPUTED" },
      })
      await tx.paymentAuditLog.create({
        data: {
          paymentId: payment.id,
          fromStatus: payment.status,
          toStatus: "DISPUTED",
          changedBy: `webhook:${event.provider}`,
          metadata: {
            disputeExternalId: event.disputeExternalId,
            reason: event.reason,
            dueDate: dueDate.toISOString(),
          },
        },
      })
    }

    // Mark event as processed for idempotency
    await tx.paymentEvent.create({
      data: {
        provider: event.provider,
        externalEventId: event.externalEventId,
        externalId: event.paymentExternalId,
        eventType: `dispute.${event.status}`,
        rawPayload: event.rawPayload as any,
      },
    })

    return { processed: true, isNew, paymentId: payment.id, dueDate }
  })

  // Email admin on new dispute — outside transaction so a failed email doesn't rollback the dispute record
  if (result.processed && (result as any).isNew) {
    const adminEmail = process.env["ADMIN_EMAIL"]
    if (adminEmail) {
      const daysLeft = Math.ceil(
        ((result as any).dueDate.getTime() - Date.now()) / 86_400_000
      )
      await sendEmail({
        to: adminEmail,
        subject: `[PayFlow] New dispute — respond within ${daysLeft} day(s)`,
        html: `
          <h2>New chargeback / dispute opened</h2>
          <table>
            <tr><td>Payment ID</td><td>${(result as any).paymentId}</td></tr>
            <tr><td>Provider</td><td>${event.provider}</td></tr>
            <tr><td>Reason</td><td>${event.reason}</td></tr>
            <tr><td>Status</td><td>${event.status}</td></tr>
            <tr><td>Due date</td><td>${(result as any).dueDate.toDateString()} (${daysLeft} days)</td></tr>
          </table>
          <p><strong>Log in to your dashboard to review and submit evidence.</strong></p>
          <p>Missing the deadline results in an automatic loss.</p>
        `,
      }).catch((err) => {
        console.error("[dispute] Failed to send admin email:", err)
      })
    }
  }

  return { processed: result.processed, reason: (result as any).reason }
}
