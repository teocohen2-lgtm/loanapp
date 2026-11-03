import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { toCsv, type CsvCell } from "../../utils/csv";

export const REPORT_TYPES = [
  "applications",
  "repayments",
  "borrowers",
  "pricing",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Hard cap so one download cannot exhaust server memory. */
const MAX_ROWS = 50_000;

export type ReportFilters = {
  /** YYYY-MM-DD, inclusive, Philippine time (UTC+8). */
  from?: string;
  to?: string;
  status?: string;
};

/** Start of `from` and end of `to` as UTC instants, interpreting the dates in Manila time. */
function createdAtRange(f: ReportFilters): Prisma.DateTimeFilter | undefined {
  if (!f.from && !f.to) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (f.from) range.gte = new Date(`${f.from}T00:00:00+08:00`);
  if (f.to)
    range.lt = new Date(
      new Date(`${f.to}T00:00:00+08:00`).getTime() + 86_400_000
    );
  return range;
}

/** 09XXXXXXXXX is easier to read in Philippine spreadsheets and cannot be read as a formula. */
const localMobile = (e164: string) =>
  e164.startsWith("+63") ? `0${e164.slice(3)}` : e164;
const last4 = (v: string) => (v ? `****${v.slice(-4)}` : "");
const iso = (d: Date | null) => (d ? d.toISOString() : "");

type QuoteSnapshot = {
  netProceeds?: string;
  totalInterest?: string;
  totalRepayment?: string;
};

export async function buildReport(
  type: ReportType,
  filters: ReportFilters
): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const createdAt = createdAtRange(filters);
  let headers: string[];
  let rows: CsvCell[][];

  if (type === "applications") {
    const items = await prisma.loanApplication.findMany({
      where: {
        ...(createdAt ? { createdAt } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: {
        user: {
          select: {
            mobileNumber: true,
            kycProfile: { select: { fullName: true } },
          },
        },
        _count: { select: { payments: { where: { status: "APPROVED" } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS + 1,
    });
    headers = [
      "Application ID",
      "Applied at (UTC)",
      "Borrower",
      "Mobile",
      "Status",
      "Principal (PHP)",
      "Term (months)",
      "Monthly rate (%)",
      "Rate source",
      "Net proceeds (PHP)",
      "Total interest (PHP)",
      "Total repayment (PHP)",
      "Payout method",
      "Payout account",
      "Reviewed at (UTC)",
      "Rejection reason",
      "Disbursed at (UTC)",
      "Disbursement ref",
      "Approved payments",
    ];
    rows = items.slice(0, MAX_ROWS).map((a) => {
      const q = a.quote as unknown as QuoteSnapshot;
      return [
        a.id,
        iso(a.createdAt),
        a.user.kycProfile?.fullName ?? "",
        localMobile(a.user.mobileNumber),
        a.status,
        a.principal.toFixed(2),
        a.termMonths,
        a.monthlyRatePercent.toFixed(2),
        a.rateSource,
        q.netProceeds,
        q.totalInterest,
        q.totalRepayment,
        a.disbursementMethod,
        last4(a.disbursementAccount),
        iso(a.reviewedAt),
        a.rejectionReason,
        iso(a.disbursedAt),
        a.disbursementRef,
        a._count.payments,
      ];
    });
    return finish(headers, rows, items.length);
  }

  if (type === "repayments") {
    // Only APPROVED payments are reported. Pending and rejected ones are not money received.
    const items = await prisma.payment.findMany({
      where: {
        status: "APPROVED",
        ...(createdAt ? { reviewedAt: createdAt } : {}),
      },
      include: {
        user: {
          select: {
            mobileNumber: true,
            kycProfile: { select: { fullName: true } },
          },
        },
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS + 1,
    });
    headers = [
      "Payment ID",
      "Submitted at (UTC)",
      "Approved at (UTC)",
      "Application ID",
      "Borrower",
      "Mobile",
      "Amount (PHP)",
      "Method",
      "Reference",
      "Approved by (user ID)",
    ];
    rows = items
      .slice(0, MAX_ROWS)
      .map((r) => [
        r.id,
        iso(r.createdAt),
        iso(r.reviewedAt),
        r.applicationId,
        r.user.kycProfile?.fullName ?? "",
        localMobile(r.user.mobileNumber),
        r.amount.toFixed(2),
        r.method,
        r.reference,
        r.reviewedById,
      ]);
    return finish(headers, rows, items.length);
  }

  if (type === "borrowers") {
    // Never exports ID numbers or photos: only the type and last 4 digits.
    const items = await prisma.user.findMany({
      where: { role: "BORROWER", ...(createdAt ? { createdAt } : {}) },
      select: {
        id: true,
        mobileNumber: true,
        email: true,
        isMobileVerified: true,
        kycStatus: true,
        createdAt: true,
        kycProfile: {
          select: { fullName: true, idType: true, idNumberLast4: true },
        },
        rateOverride: { select: { monthlyRatePercent: true } },
        _count: { select: { loanApplications: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS + 1,
    });
    headers = [
      "User ID",
      "Registered at (UTC)",
      "Name",
      "Mobile",
      "Email",
      "Mobile verified",
      "KYC status",
      "ID type",
      "ID last 4",
      "Custom rate (%)",
      "Applications",
    ];
    rows = items
      .slice(0, MAX_ROWS)
      .map((u) => [
        u.id,
        iso(u.createdAt),
        u.kycProfile?.fullName ?? "",
        localMobile(u.mobileNumber),
        u.email,
        u.isMobileVerified ? "yes" : "no",
        u.kycStatus,
        u.kycProfile?.idType,
        u.kycProfile?.idNumberLast4,
        u.rateOverride?.monthlyRatePercent.toFixed(2),
        u._count.loanApplications,
      ]);
    return finish(headers, rows, items.length);
  }

  const items = await prisma.loanPricingPolicy.findMany({
    where: createdAt ? { createdAt } : {},
    orderBy: { version: "desc" },
    take: MAX_ROWS + 1,
  });
  headers = [
    "Version",
    "Created at (UTC)",
    "Monthly rate (%)",
    "Processing fee (PHP)",
    "DST paid by",
    "Reason",
    "Created by (user ID)",
  ];
  rows = items
    .slice(0, MAX_ROWS)
    .map((p) => [
      p.version,
      iso(p.createdAt),
      p.monthlyRatePercent.toFixed(2),
      p.processingFee.toFixed(2),
      p.dstPayer,
      p.reason,
      p.createdById,
    ]);
  return finish(headers, rows, items.length);
}

function finish(headers: string[], rows: CsvCell[][], fetched: number) {
  return {
    csv: toCsv(headers, rows),
    rowCount: rows.length,
    truncated: fetched > MAX_ROWS,
  };
}
