-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IdType" ADD VALUE 'SSS';
ALTER TYPE "IdType" ADD VALUE 'TIN';
ALTER TYPE "IdType" ADD VALUE 'PRC';

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "disbursedAt" TIMESTAMP(3),
ADD COLUMN     "disbursementAccount" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disbursementBankCode" TEXT,
ADD COLUMN     "disbursementMethod" TEXT NOT NULL DEFAULT 'GCASH',
ADD COLUMN     "disbursementRef" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repayment_userId_createdAt_idx" ON "Repayment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Repayment_applicationId_installmentNo_key" ON "Repayment"("applicationId", "installmentNo");

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

