-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'payment';

-- CreateIndex
CREATE INDEX "OutboxEvent_category_sentAt_idx" ON "OutboxEvent"("category", "sentAt");
