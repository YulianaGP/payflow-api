function formatAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f9fafb; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 8px; max-width: 560px;
          margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; }
  .brand { font-size: 1.25rem; font-weight: 700; color: #111; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 0.9rem; }
  td:first-child { color: #6b7280; width: 40%; }
  td:last-child { font-weight: 500; color: #111; }
  .cta { display: inline-block; margin-top: 24px; padding: 10px 24px;
         border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  .footer { margin-top: 24px; font-size: 0.75rem; color: #9ca3af; text-align: center; }
`

export function paymentSuccessHtml(data: {
  paymentId: string
  amount: number
  currency: string
  orderId: string
  createdAt: Date
  description?: string
  receiptUrl?: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">✅ Payment confirmed</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">Your payment was processed successfully.</p>
    <table>
      <tr><td>Amount</td><td>${formatAmount(data.amount, data.currency)}</td></tr>
      <tr><td>Transaction ID</td><td style="font-family:monospace;font-size:0.8rem">${data.paymentId}</td></tr>
      <tr><td>Order</td><td>${data.orderId}</td></tr>
      ${data.description ? `<tr><td>Description</td><td>${data.description}</td></tr>` : ""}
      <tr><td>Date</td><td>${formatDate(data.createdAt)}</td></tr>
    </table>
    ${data.receiptUrl ? `<a href="${data.receiptUrl}" class="cta" style="background:#111;color:#fff">Download receipt</a>` : ""}
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function paymentFailedHtml(data: {
  paymentId: string
  amount: number
  currency: string
  orderId: string
  createdAt: Date
  retryUrl?: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">❌ Payment failed</h2>
    <p style="margin:0 0 4px;color:#6b7280;font-size:0.9rem">We couldn't process your payment.</p>
    <p style="margin:0 0 16px;font-weight:600;color:#dc2626;font-size:0.9rem">Your card was NOT charged.</p>
    <table>
      <tr><td>Amount</td><td>${formatAmount(data.amount, data.currency)}</td></tr>
      <tr><td>Order</td><td>${data.orderId}</td></tr>
      <tr><td>Date</td><td>${formatDate(data.createdAt)}</td></tr>
    </table>
    ${data.retryUrl ? `<a href="${data.retryUrl}" class="cta" style="background:#dc2626;color:#fff">Try again</a>` : ""}
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function subscriptionDunningWarningHtml(data: {
  planName: string
  gracePeriodEndsAt: string
  updatePaymentUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">⚠️ Action required: update your payment method</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">
      We couldn't process your payment for <strong>${data.planName}</strong>.
      Please update your payment method to keep your access.
    </p>
    <table>
      <tr><td>Access ends</td><td style="color:#dc2626;font-weight:600">${data.gracePeriodEndsAt}</td></tr>
    </table>
    <a href="${data.updatePaymentUrl}" class="cta" style="background:#f59e0b;color:#fff">Update payment method</a>
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function subscriptionDunningUrgentHtml(data: {
  planName: string
  gracePeriodEndsAt: string
  updatePaymentUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#dc2626">🚨 Your access is expiring soon</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">
      Your <strong>${data.planName}</strong> subscription will be canceled on <strong>${data.gracePeriodEndsAt}</strong>
      unless you update your payment method now.
    </p>
    <a href="${data.updatePaymentUrl}" class="cta" style="background:#dc2626;color:#fff">Update payment method now</a>
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function subscriptionCanceledDunningHtml(data: { planName: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">Your subscription has been canceled</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">
      Your <strong>${data.planName}</strong> subscription was canceled because we couldn't process your payment
      after several attempts. You can resubscribe at any time.
    </p>
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function subscriptionPaymentRecoveredHtml(data: { planName: string; nextBillingDate: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">✅ Payment recovered — access restored</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">
      Your payment for <strong>${data.planName}</strong> was processed successfully. Your subscription is active again.
    </p>
    <table>
      <tr><td>Next billing</td><td>${data.nextBillingDate}</td></tr>
    </table>
    <div class="footer">PayFlow — Secure payments</div>
  </div>
</body>
</html>`
}

export function passwordResetHtml(data: { resetUrl: string; expiresAt: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <div class="brand">PayFlow</div>
    <h2 style="margin:0 0 4px;font-size:1.3rem;color:#111">Reset your password</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:0.9rem">
      Click the button below to set a new password. This link expires in 1 hour.
    </p>
    <a href="${data.resetUrl}" class="cta" style="background:#111;color:#fff">Reset password</a>
    <div class="footer">If you didn't request this, you can safely ignore this email.</div>
  </div>
</body>
</html>`
}
