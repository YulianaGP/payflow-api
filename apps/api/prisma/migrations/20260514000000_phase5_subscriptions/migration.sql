-- Phase 5: Subscriptions schema changes
-- 1. Payment.subscriptionId — link payments to subscription renewals
-- 2. Subscription: replace failedPaymentCount with real timestamp fields
-- 3. Subscription: add unitPrice + currency pricing snapshot (immutable)
-- 4. New model: SubscriptionAuditLog (immutable, same pattern as PaymentAuditLog)

-- ─── Payment.subscriptionId ───────────────────────────────────────────────────

ALTER TABLE "Payment" ADD COLUMN "subscriptionId" TEXT;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- ─── Subscription: dunning timestamp fields ───────────────────────────────────

-- Drop the execution-count counter in favor of real timestamps
ALTER TABLE "Subscription" DROP COLUMN "failedPaymentCount";

ALTER TABLE "Subscription" ADD COLUMN "firstPaymentFailureAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "lastDunningAttemptAt"  TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "nextDunningAttemptAt"  TIMESTAMP(3);

CREATE INDEX "Subscription_status_nextDunningAttemptAt_idx"
  ON "Subscription"("status", "nextDunningAttemptAt");

-- ─── Subscription: pricing snapshot ──────────────────────────────────────────
-- Add as nullable first, backfill from Plan, then enforce NOT NULL.
-- This handles existing seed rows without requiring a risky default value.

ALTER TABLE "Subscription" ADD COLUMN "unitPrice" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "currency"  TEXT;

UPDATE "Subscription" s
SET "unitPrice" = p."price",
    "currency"  = p."currency"
FROM "Plan" p
WHERE p."id" = s."planId";

ALTER TABLE "Subscription" ALTER COLUMN "unitPrice" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "currency"  SET NOT NULL;

-- ─── SubscriptionAuditLog ─────────────────────────────────────────────────────
-- Immutable audit trail for subscription state changes.
-- No updatedAt — these records are never modified, only appended.

CREATE TABLE "SubscriptionAuditLog" (
  "id"             TEXT         NOT NULL,
  "subscriptionId" TEXT         NOT NULL,
  "fromStatus"     TEXT         NOT NULL,
  "toStatus"       TEXT         NOT NULL,
  "changedBy"      TEXT         NOT NULL,
  "metadata"       JSONB        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubscriptionAuditLog" ADD CONSTRAINT "SubscriptionAuditLog_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SubscriptionAuditLog_subscriptionId_createdAt_idx"
  ON "SubscriptionAuditLog"("subscriptionId", "createdAt");
