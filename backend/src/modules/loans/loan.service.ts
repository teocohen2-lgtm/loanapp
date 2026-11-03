import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";

import { calculateLoan, type QuoteInput } from "../loan-engine/loan-engine";

export type LoanRequest = {
  principal: string;
  termMonths: number;
  startDate: string;
};

export type ApplicationInput = LoanRequest & {
  requestKey: string;
  disbursementMethod: "GCASH" | "MAYA" | "INSTAPAY" | "PESONET";
  disbursementAccount: string;
  disbursementBankCode?: string | null;
};

type QuoteOptions = {
  simulationRate?: string;
  method?: QuoteInput["method"];
};

/**
 * Pricing priority:
 *
 * Calculator simulation → borrower override → product default.
 *
 * Applications never pass a simulation rate.
 * Routes will validate inputs before calling this service.
 */
export async function quoteLoan(
  userId: string,
  input: LoanRequest,
  options: QuoteOptions = {},
  db: Prisma.TransactionClient = prisma
) {
  const policy = await db.loanPricingPolicy.findFirst({
    orderBy: {
      version: "desc",
    },
  });

  if (!policy) {
    throw new ApiError(
      503,
      "An admin must configure product pricing first",
      "LOAN_POLICY_REQUIRED"
    );
  }

  const override = await db.borrowerRateOverride.findUnique({
    where: {
      userId,
    },
  });

  const rateSource =
    options.simulationRate !== undefined
      ? "SIMULATION"
      : override
      ? "BORROWER_OVERRIDE"
      : "PRODUCT_DEFAULT";

  const monthlyRatePercent =
    options.simulationRate ??
    override?.monthlyRatePercent.toString() ??
    policy.monthlyRatePercent.toString();

  if (policy.dstPayer !== "LENDER" && policy.dstPayer !== "BORROWER") {
    throw new ApiError(
      500,
      "Invalid product configuration",
      "INVALID_LOAN_POLICY"
    );
  }

  const quote = calculateLoan({
    ...input,
    monthlyRatePercent,
    processingFee: policy.processingFee.toString(),
    dstPayer: policy.dstPayer,
    method: options.method ?? "DIMINISHING",
  });

  return {
    policy,
    rateSource,
    quote,
  };
}

/**
 * Normalize inputs before hashing.
 *
 * "10000" and "10000.00" represent the same amount.
 * The hash helps identify retries with changed details.
 */
function hashRequest(input: ApplicationInput): string {
  const normalized = {
    principal: new Prisma.Decimal(input.principal).toFixed(2),

    termMonths: input.termMonths,
    startDate: input.startDate,

    // A retry with a different payout account must not silently replay.
    disbursementMethod: input.disbursementMethod,
    disbursementAccount: input.disbursementAccount,
    disbursementBankCode: input.disbursementBankCode ?? null,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

/**
 * Save a DEMO application with frozen pricing and schedule.
 *
 * Repeating the same requestKey with the same details
 * returns the existing application.
 */
export async function submitApplication(
  userId: string,
  input: ApplicationInput
) {
  const requestHash = hashRequest(input);

  return prisma.$transaction(async (tx) => {
    /*
     * Lock this borrower row.
     *
     * Concurrent submissions and borrower-rate updates
     * must use the same lock to serialize their changes.
     */
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;

    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || user.role !== "BORROWER") {
      throw ApiError.forbidden("A borrower account is required");
    }

    const previous = await tx.loanApplication.findUnique({
      where: {
        userId_requestKey: {
          userId,
          requestKey: input.requestKey,
        },
      },
    });

    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw ApiError.conflict(
          "This requestKey was used with different loan details"
        );
      }

      return {
        application: previous,
        replayed: true,
      };
    }

    if (!user.isMobileVerified || user.kycStatus !== "APPROVED") {
      throw ApiError.forbidden("Verified mobile and approved KYC are required");
    }

    /*
     * Application pricing always comes from the database.
     * A calculator simulation cannot override it.
     */
    const { policy, rateSource, quote } = await quoteLoan(
      userId,
      {
        principal: input.principal,
        termMonths: input.termMonths,
        startDate: input.startDate,
      },
      {},
      tx
    );

    if (!quote.applicationEligible) {
      throw ApiError.badRequest(
        quote.ineligibleReasons.join("; ") ||
          "This loan does not pass the product cost checks",
        quote.ineligibleReasons
      );
    }

    const application = await tx.loanApplication.create({
      data: {
        userId,
        policyId: policy.id,

        requestKey: input.requestKey,
        requestHash,

        principal: quote.principal,
        termMonths: quote.termMonths,
        monthlyRatePercent: quote.monthlyRatePercent,
        rateSource,

        status: "SUBMITTED",
        demoOnly: true,

        disbursementMethod: input.disbursementMethod,
        disbursementAccount: input.disbursementAccount,
        disbursementBankCode: input.disbursementBankCode ?? null,

        // Save the complete calculation as an immutable snapshot.
        quote: quote as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      application,
      replayed: false,
    };
  });
}

/**
 * A borrower can retrieve only their own application.
 * Return 404 for missing applications or another user's ID.
 */
// export async function getMyApplication(userId: string, applicationId: string) {
//   const application = await prisma.loanApplication.findFirst({
//     where: {
//       id: applicationId,
//       userId,
//     },
//     include: { repayments: { orderBy: { installmentNo: "asc" } } },
//   });

//   if (!application) {
//     throw ApiError.notFound("Application not found");
//   }

//   return application;
// }
