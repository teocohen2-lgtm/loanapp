-- Product pricing versions
CREATE TABLE "LoanPricingPolicy" (
    "version" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "monthlyRatePercent" DECIMAL(9,6) NOT NULL,
    "processingFee" DECIMAL(14,2) NOT NULL,
    "dstPayer" TEXT NOT NULL DEFAULT 'LENDER',
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPricingPolicy_pkey"
        PRIMARY KEY ("id")
);

-- Optional borrower-specific pricing
CREATE TABLE "BorrowerRateOverride" (
    "userId" TEXT NOT NULL,
    "monthlyRatePercent" DECIMAL(9,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerRateOverride_pkey"
        PRIMARY KEY ("userId")
);

-- Demo applications with frozen calculation results
CREATE TABLE "LoanApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyRatePercent" DECIMAL(9,6) NOT NULL,
    "rateSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "demoOnly" BOOLEAN NOT NULL DEFAULT true,
    "quote" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanApplication_pkey"
        PRIMARY KEY ("id")
);

-- Pricing change history
CREATE TABLE "LoanPricingAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPricingAudit_pkey"
        PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "LoanPricingPolicy_version_key"
    ON "LoanPricingPolicy"("version");

CREATE INDEX "LoanApplication_userId_createdAt_idx"
    ON "LoanApplication"("userId", "createdAt");

CREATE UNIQUE INDEX "LoanApplication_userId_requestKey_key"
    ON "LoanApplication"("userId", "requestKey");

-- Relationships
ALTER TABLE "BorrowerRateOverride"
    ADD CONSTRAINT "BorrowerRateOverride_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "LoanApplication"
    ADD CONSTRAINT "LoanApplication_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "LoanApplication"
    ADD CONSTRAINT "LoanApplication_policyId_fkey"
    FOREIGN KEY ("policyId")
    REFERENCES "LoanPricingPolicy"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;