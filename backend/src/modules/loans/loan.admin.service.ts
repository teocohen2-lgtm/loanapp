import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";

type ProductPricingInput = {
  monthlyRatePercent: string;
  processingFee: string;
  dstPayer: "LENDER" | "BORROWER";
  reason: string;
};

type BorrowerRateInput = {
  // null removes the override and restores the product default.
  monthlyRatePercent: string | null;
  reason: string;
};

/**
 * Check permissions inside the write transaction.
 * API routes will also enforce ADMIN access.
 */
async function assertAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({
    where: {
      id: actorId,
    },
    select: {
      role: true,
    },
  });

  if (actor?.role !== "ADMIN") {
    throw ApiError.forbidden("Only an admin can change loan pricing");
  }
}

/**
 * Create a new version of product-default pricing.
 *
 * Existing policies and application snapshots stay unchanged.
 * Inputs must be validated by the API route.
 */
export async function createProductPricing(
  actorId: string,
  input: ProductPricingInput
) {
  return prisma.$transaction(async (tx) => {
    /*
     * Serialize product-pricing writes across API processes.
     * PostgreSQL releases this lock when the transaction ends.
     *
     * Select an integer because the lock function returns void.
     */
    await tx.$queryRaw`
      SELECT 1 AS locked
      FROM pg_advisory_xact_lock(684031001::bigint)
    `;

    await assertAdmin(tx, actorId);

    const previous = await tx.loanPricingPolicy.findFirst({
      orderBy: {
        version: "desc",
      },
    });

    const policy = await tx.loanPricingPolicy.create({
      data: {
        ...input,
        createdById: actorId,
      },
    });

    // Pricing and its audit record commit together.
    await tx.loanPricingAudit.create({
      data: {
        actorId,
        action: "CREATE_PRODUCT_VERSION",

        before: previous
          ? {
              policyId: previous.id,
              monthlyRatePercent: previous.monthlyRatePercent.toString(),
              processingFee: previous.processingFee.toString(),
              dstPayer: previous.dstPayer,
            }
          : Prisma.JsonNull,

        after: {
          policyId: policy.id,
          version: policy.version,
          monthlyRatePercent: policy.monthlyRatePercent.toString(),
          processingFee: policy.processingFee.toString(),
          dstPayer: policy.dstPayer,
        },

        reason: input.reason,
      },
    });

    return policy;
  });
}

/**
 * Set or clear a borrower-specific rate.
 *
 * Changes affect NEW applications only.
 * Inputs must be validated by the API route.
 */
export async function setBorrowerRate(
  actorId: string,
  userId: string,
  input: BorrowerRateInput
) {
  return prisma.$transaction(async (tx) => {
    /*
     * Use the same borrower lock as submitApplication().
     * This prevents a rate edit and submission from racing.
     */
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;

    await assertAdmin(tx, actorId);

    const borrower = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        role: true,
      },
    });

    if (!borrower || borrower.role !== "BORROWER") {
      throw ApiError.notFound("Borrower not found");
    }

    const previous = await tx.borrowerRateOverride.findUnique({
      where: {
        userId,
      },
    });

    if (input.monthlyRatePercent === null) {
      // No override means future applications inherit the default.
      await tx.borrowerRateOverride.deleteMany({
        where: {
          userId,
        },
      });
    } else {
      const values = {
        monthlyRatePercent: input.monthlyRatePercent,
        reason: input.reason,
        updatedById: actorId,
      };

      await tx.borrowerRateOverride.upsert({
        where: {
          userId,
        },

        create: {
          userId,
          ...values,
        },

        update: values,
      });
    }

    await tx.loanPricingAudit.create({
      data: {
        actorId,
        targetUserId: userId,

        action:
          input.monthlyRatePercent === null
            ? "CLEAR_BORROWER_RATE"
            : "SET_BORROWER_RATE",

        before: previous
          ? {
              monthlyRatePercent: previous.monthlyRatePercent.toString(),
            }
          : Prisma.JsonNull,

        after: {
          monthlyRatePercent:
            input.monthlyRatePercent === null
              ? null
              : new Prisma.Decimal(input.monthlyRatePercent).toString(),
        },

        reason: input.reason,
      },
    });

    return {
      userId,
      monthlyRatePercent: input.monthlyRatePercent,
      appliesTo: "NEW_APPLICATIONS_ONLY" as const,
    };
  });
}
