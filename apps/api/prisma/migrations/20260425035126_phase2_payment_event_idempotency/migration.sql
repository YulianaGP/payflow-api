/*
  Warnings:

  - A unique constraint covering the columns `[provider,externalEventId]` on the table `PaymentEvent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalEventId` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PaymentEvent_provider_externalId_eventType_key";

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "externalEventId" TEXT NOT NULL,
ADD COLUMN     "rawPayload" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_externalEventId_key" ON "PaymentEvent"("provider", "externalEventId");
