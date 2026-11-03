import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { mockCollect, mockDisburse } from "../../services/mock/payments";
import type { PaymentMethodValue } from "../../config/ph";

type Tx = Prisma.TransactionClient;

type QuoteSnapshot = {
  netProceeds: string;
  termMonths: number;
  schedule: { installment: number; payment: string; dueDate: string }[];
};

/** Serialize all state changes for one application across API processes. */
async function lockApplication(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "LoanApplication" WHERE "id" = ${id} FOR UPDATE`;
}

async function assertAdmin(tx: Tx, actorId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true },
  });
  if (actor?.role !== "ADMIN")
    throw ApiError.forbidden("Only an admin can manage loan applications");
}

const quoteOf = (value: Prisma.JsonValue) => value as unknown as QuoteSnapshot;

/** Admin approves or rejects a SUBMITTED application. */
export async function reviewApplication(
  actorId: string,
  applicationId: string,
  input: { decision: "APPROVED" | "REJECTED"; reason?: string }
) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, applicationId);
    await assertAdmin(tx, actorId);

    const application = await tx.loanApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw ApiError.notFound("Application not found");
    if (application.status !== "SUBMITTED")
      throw ApiError.conflict(`Application is already ${application.status.toLowerCase()}`);

    return tx.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: input.decision,
        rejectionReason: input.decision === "REJECTED" ? input.reason : null,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
  });
}

/**
 * Admin releases an APPROVED loan to the borrower's chosen channel.
 * The provider is a mock: if it rejects, the transaction rolls back and the
 * application stays APPROVED so the admin can retry.
 */
export async function disburseApplication(actorId: string, applicationId: string) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, applicationId);
    await assertAdmin(tx, actorId);

    const application = await tx.loanApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw ApiError.notFound("Application not found");
    if (application.status !== "APPROVED")
      throw ApiError.conflict("Only approved applications can be disbursed");

    const quote = quoteOf(application.quote);
    const transfer = await mockDisburse({
      method: application.disbursementMethod as PaymentMethodValue,
      account: application.disbursementAccount,
      bankCode: application.disbursementBankCode,
      amount: quote.netProceeds,
    });

    const updated = await tx.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: "DISBURSED",
        disbursedAt: new Date(),
        disbursementRef: transfer.reference,
      },
    });
    return { application: updated, eta: transfer.eta, amount: quote.netProceeds };
  });
}

/** Borrower pays the next unpaid installment in full through a chosen channel. */
export async function payNextInstallment(
  userId: string,
  applicationId: string,
  method: PaymentMethodValue
) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, applicationId);

    const application = await tx.loanApplication.findFirst({
      where: { id: applicationId, userId },
      include: { repayments: { select: { installmentNo: true } } },
    });
    if (!application) throw ApiError.notFound("Application not found");
    if (application.status !== "DISBURSED")
      throw ApiError.conflict("Payments are accepted only on disbursed, unpaid loans");

    const quote = quoteOf(application.quote);
    const installmentNo = application.repayments.length + 1;
    const row = quote.schedule[installmentNo - 1];
    if (!row) throw ApiError.conflict("This loan has no remaining installments");

    const collected = await mockCollect({ method, amount: row.payment });

    const repayment = await tx.repayment.create({
      data: {
        applicationId,
        userId,
        installmentNo,
        amount: row.payment,
        method,
        reference: collected.reference,
      },
    });

    const fullyPaid = installmentNo === quote.schedule.length;
    const updated = fullyPaid
      ? await tx.loanApplication.update({
          where: { id: applicationId },
          data: { status: "REPAID" },
        })
      : application;

    return { repayment, status: fullyPaid ? "REPAID" : "DISBURSED", application: updated };
  });
}
