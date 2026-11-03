import { Prisma } from "@prisma/client";

/**
 * Loan statement maths. Only APPROVED payments are money received.
 * PENDING payments are shown separately; REJECTED ones never count.
 * Approved money is applied to the oldest installment first.
 */

export type ScheduleRowLite = {
  installment: number;
  dueDate: string;
  payment: string;
};

export type QuoteForLedger = {
  totalRepayment: string;
  schedule: ScheduleRowLite[];
};

export type PaymentLite = {
  id: string;
  amount: Prisma.Decimal | string | number;
  status: string;
  method: string;
  reference: string;
  rejectionReason: string | null;
  createdAt: Date;
};

export type InstallmentStatus = "PAID" | "PARTIAL" | "UNPAID";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const fmt = (v: Prisma.Decimal) => v.toDecimalPlaces(2).toFixed(2);

/** Today's date in Philippine time, YYYY-MM-DD. */
export const todayInManila = () =>
  new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

export function sumByStatus(
  payments: Pick<PaymentLite, "amount" | "status">[],
  status: string
) {
  return payments
    .filter((p) => p.status === status)
    .reduce((total, p) => total.plus(D(p.amount)), D(0));
}

export function buildLedger(
  quote: QuoteForLedger,
  payments: PaymentLite[],
  today = todayInManila()
) {
  const approved = sumByStatus(payments, "APPROVED");
  const pending = sumByStatus(payments, "PENDING");

  let left = approved;
  const installments = quote.schedule.map((row) => {
    const due = D(row.payment);
    const paid = Prisma.Decimal.min(left, due);
    left = left.minus(paid);
    const remaining = due.minus(paid);
    const status: InstallmentStatus = remaining.isZero()
      ? "PAID"
      : paid.gt(0)
      ? "PARTIAL"
      : "UNPAID";
    return {
      installment: row.installment,
      dueDate: row.dueDate,
      amountDue: fmt(due),
      paid: fmt(paid),
      remaining: fmt(remaining),
      status,
      overdue: status !== "PAID" && row.dueDate < today,
    };
  });

  const totalDue = D(quote.totalRepayment);
  const remaining = Prisma.Decimal.max(totalDue.minus(approved), D(0));
  const next = installments.find((i) => i.status !== "PAID") ?? null;

  // A rejection stays visible until the borrower submits a newer payment that is not rejected.
  const ordered = [...payments].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const rejectedNeedingAction = ordered.filter(
    (p, index) =>
      p.status === "REJECTED" &&
      !ordered.slice(index + 1).some((later) => later.status !== "REJECTED")
  );

  return {
    installments,
    totalDue: fmt(totalDue),
    approvedPaid: fmt(approved),
    pendingAmount: fmt(pending),
    pendingCount: payments.filter((p) => p.status === "PENDING").length,
    remaining: fmt(remaining),
    // What can still be submitted right now (not yet paid and not already waiting for approval).
    availableToSubmit: fmt(Prisma.Decimal.max(remaining.minus(pending), D(0))),
    paidInstallments: installments.filter((i) => i.status === "PAID").length,
    overdueCount: installments.filter((i) => i.overdue).length,
    next,
    rejectedNeedingAction: rejectedNeedingAction.map((p) => ({
      id: p.id,
      amount: fmt(D(p.amount)),
      method: p.method,
      reference: p.reference,
      reason: p.rejectionReason,
      createdAt: p.createdAt,
    })),
  };
}
