/* Old one-click repayments are kept: they are copied into "Payment" as APPROVED before the old table is dropped. */
-- DropForeignKey
ALTER TABLE "Repayment" DROP CONSTRAINT "Repayment_applicationId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chequeAllowed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivingAccount" (
    "kind" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "instructions" TEXT,
    "qrKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingAccount_pkey" PRIMARY KEY ("kind")
);

-- CreateIndex
CREATE INDEX "Payment_applicationId_createdAt_idx" ON "Payment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep earlier (demo) repayments as approved payments so existing loans keep their balance.
INSERT INTO "Payment" ("id", "applicationId", "userId", "amount", "method", "reference", "status", "reviewedAt", "createdAt")
SELECT gen_random_uuid()::text, "applicationId", "userId", "amount", "method", "reference", 'APPROVED', "createdAt", "createdAt"
FROM "Repayment";

-- DropTable
DROP TABLE "Repayment";