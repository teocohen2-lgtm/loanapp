import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  COLLECTION_METHODS,
  MIN_PAYMENT_AMOUNT,
  type CollectionMethodValue,
} from "../../config/ph";
import { buildLedger, sumByStatus, type QuoteForLedger } from "./loan.ledger";
import { lockApplication } from "./loan.workflow.service";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const MAX_PENDING_PER_LOAN = 5;

const quoteOf = (value: Prisma.JsonValue) => value as unknown as QuoteForLedger;

/** Uppercase, single-spaced, so "ab 123" and "AB  123" count as the same reference. */
export const normalizeReference = (raw: string) =>
  raw.trim().replace(/\s+/g, " ").toUpperCase();

const paymentSelect = {
  id: true,
  amount: true,
  status: true,
  method: true,
  reference: true,
  note: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
} as const;

/** Receiving accounts the borrower may pay into, plus whether cheque is switched on for them. */
export async function getPaymentInfo(userId: string) {
  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { chequeAllowed: true },
    }),
    prisma.receivingAccount.findMany({ where: { active: true } }),
  ]);
  const chequeAllowed = !!user?.chequeAllowed;

  const methods = COLLECTION_METHODS.filter(
    (m) => m.value !== "CHEQUE" || chequeAllowed
  )
    .map((m) => {
      const account = accounts.find((a) => a.kind === m.accountKind);
      return account
        ? {
            value: m.value,
            label: m.label,
            kind: account.kind,
            accountName: account.accountName,
            accountNumber: account.accountNumber,
            bankName: account.bankName,
            instructions: account.instructions,
            hasQr:
              !!account.qrKey &&
              m.value !== "BANK_TRANSFER" &&
              m.value !== "CHEQUE",
          }
        : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return { methods, chequeAllowed, minAmount: MIN_PAYMENT_AMOUNT.toFixed(2) };
}

/** Borrower's full statement for one loan: schedule status, balance, payment history. */
export async function getLoanStatement(applicationId: string, userId?: string) {
  const application = await prisma.loanApplication.findFirst({
    where: userId ? { id: applicationId, userId } : { id: applicationId },
    include: {
      payments: {
        select: paymentSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!application) throw ApiError.notFound("Application not found");

  const { payments, ...loan } = application;
  const ledger = buildLedger(quoteOf(loan.quote), payments);
  return { application: loan, payments, ledger };
}

/** Borrower says "I paid this amount, here is the reference". Nothing counts until staff approve. */
export async function submitPayment(
  userId: string,
  applicationId: string,
  input: {
    method: CollectionMethodValue;
    amount: string;
    reference: string;
    note?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    await lockApplication(tx, applicationId);

    const application = await tx.loanApplication.findFirst({
      where: { id: applicationId, userId },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!application) throw ApiError.notFound("Application not found");
    if (application.status !== "DISBURSED")
      throw ApiError.conflict(
        "Payments are accepted only on active, unpaid loans"
      );

    const channel = COLLECTION_METHODS.find((m) => m.value === input.method);
    if (!channel) throw ApiError.badRequest("Unsupported payment method");

    if (channel.value === "CHEQUE") {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { chequeAllowed: true },
      });
      if (!user?.chequeAllowed)
        throw ApiError.forbidden(
          "Cheque payments are not enabled for your account. Please pay by GCash QR, Maya QR or bank transfer."
        );
    }

    const account = await tx.receivingAccount.findUnique({
      where: { kind: channel.accountKind },
    });
    if (!account || !account.active)
      throw ApiError.conflict(
        `${channel.label} is not available right now. Please choose another method.`
      );

    const pendingCount = application.payments.filter(
      (p) => p.status === "PENDING"
    ).length;
    if (pendingCount >= MAX_PENDING_PER_LOAN)
      throw ApiError.conflict(
        "You already have several payments waiting for approval. Please wait for them to be reviewed."
      );

    const total = D(quoteOf(application.quote).totalRepayment);
    const approved = sumByStatus(application.payments, "APPROVED");
    const pending = sumByStatus(application.payments, "PENDING");
    const available = Prisma.Decimal.max(
      total.minus(approved).minus(pending),
      D(0)
    );

    if (available.lte(0))
      throw ApiError.conflict(
        pending.gt(0)
          ? "Your earlier payments are waiting for approval. Nothing more is due until they are reviewed."
          : "This loan has nothing left to pay"
      );

    const amount = D(input.amount);
    const minimum = Prisma.Decimal.min(D(MIN_PAYMENT_AMOUNT), available);
    if (amount.lt(minimum))
      throw ApiError.badRequest(
        `The smallest payment is PHP ${minimum.toFixed(2)}`
      );
    if (amount.gt(available))
      throw ApiError.badRequest(
        `You can pay at most PHP ${available.toFixed(2)} right now`
      );

    // The same reference cannot be used twice (stops one receipt being claimed on several loans).
    const reference = normalizeReference(input.reference);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${
      "payment-ref:" + reference
    }))`;
    const duplicate = await tx.payment.findFirst({
      where: { reference, status: { in: ["PENDING", "APPROVED"] } },
      select: { id: true },
    });
    if (duplicate)
      throw ApiError.conflict("This reference number was already submitted");

    const payment = await tx.payment.create({
      data: {
        applicationId,
        userId,
        amount: amount.toFixed(2),
        method: input.method,
        reference,
        note: input.note || null,
      },
      select: paymentSelect,
    });
    return { payment };
  });
}

/** Staff approve (money was received) or reject (not received) a pending payment. */
export async function reviewPayment(
  actorId: string,
  paymentId: string,
  input: { decision: "APPROVED" | "REJECTED"; reason?: string }
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { applicationId: true },
    });
    if (!found) throw ApiError.notFound("Payment not found");

    await lockApplication(tx, found.applicationId);

    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "REVIEWER")
      throw ApiError.forbidden("Only an admin or reviewer can review payments");

    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw ApiError.notFound("Payment not found");
    if (payment.status !== "PENDING")
      throw ApiError.conflict(
        `This payment was already ${payment.status.toLowerCase()}`
      );

    const reviewData = { reviewedById: actorId, reviewedAt: new Date() };

    if (input.decision === "REJECTED") {
      const rejected = await tx.payment.update({
        where: { id: paymentId },
        data: {
          ...reviewData,
          status: "REJECTED",
          rejectionReason: input.reason,
        },
        select: paymentSelect,
      });
      return { payment: rejected, loanStatus: "DISBURSED" as const };
    }

    const application = await tx.loanApplication.findUnique({
      where: { id: payment.applicationId },
      include: {
        payments: {
          where: { status: "APPROVED" },
          select: { amount: true, status: true },
        },
      },
    });
    if (!application) throw ApiError.notFound("Application not found");

    const total = D(quoteOf(application.quote).totalRepayment);
    const approvedAfter = sumByStatus(application.payments, "APPROVED").plus(
      payment.amount
    );
    if (approvedAfter.gt(total))
      throw ApiError.conflict(
        "Approving this payment would be more than the amount due. Reject it or check the amount."
      );

    const approved = await tx.payment.update({
      where: { id: paymentId },
      data: { ...reviewData, status: "APPROVED", rejectionReason: null },
      select: paymentSelect,
    });

    const fullyPaid = approvedAfter.gte(total);
    if (fullyPaid)
      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: "REPAID" },
      });

    return {
      payment: approved,
      loanStatus: fullyPaid ? ("REPAID" as const) : ("DISBURSED" as const),
    };
  });
}

/** Staff queue. Shows who paid, how much, with what reference, and where the loan stands. */
export async function listPaymentsForStaff(
  status: "PENDING" | "APPROVED" | "REJECTED",
  page: number
) {
  const pageSize = 25;
  const items = await prisma.payment.findMany({
    where: { status },
    include: {
      application: {
        select: { id: true, principal: true, termMonths: true, quote: true },
      },
      user: {
        select: {
          mobileNumber: true,
          kycProfile: { select: { fullName: true } },
        },
      },
    },
    orderBy: [
      { createdAt: status === "PENDING" ? "asc" : "desc" },
      { id: "asc" },
    ],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const sums = await prisma.payment.groupBy({
    by: ["applicationId"],
    where: {
      status: "APPROVED",
      applicationId: { in: items.map((i) => i.applicationId) },
    },
    _sum: { amount: true },
  });
  const approvedByLoan = new Map(
    sums.map((s) => [s.applicationId, s._sum.amount ?? D(0)])
  );

  return {
    page,
    pageSize,
    items: items.map(({ application, user, ...p }) => {
      const total = D(quoteOf(application.quote).totalRepayment);
      const approved = approvedByLoan.get(p.applicationId) ?? D(0);
      return {
        ...p,
        borrowerName: user.kycProfile?.fullName ?? "",
        borrowerMobile: user.mobileNumber,
        loan: {
          id: application.id,
          principal: application.principal,
          termMonths: application.termMonths,
          totalDue: total.toFixed(2),
          approvedPaid: D(approved).toFixed(2),
          remaining: Prisma.Decimal.max(total.minus(approved), D(0)).toFixed(2),
        },
      };
    }),
  };
}
