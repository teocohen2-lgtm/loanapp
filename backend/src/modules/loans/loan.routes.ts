import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

import { authenticate, requireRole } from "../../middleware/auth";

import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";

import {
  applicationSchema,
  calculatorSchema,
  overrideSchema,
  policySchema,
  chequeToggleSchema,
  receivingAccountSchema,
  reviewApplicationSchema,
  reviewPaymentSchema,
  submitPaymentSchema,
} from "./loan.schemas";

import { quoteLoan, submitApplication } from "./loan.service";
import { buildLedger } from "./loan.ledger";
import {
  getLoanStatement,
  getPaymentInfo,
  listPaymentsForStaff,
  reviewPayment,
  submitPayment,
} from "./loan.payment.service";
import { detectImageExt, qrUpload } from "../../middleware/upload";
import { readFile, removeFile, saveFile } from "../../services/storage";

import { createProductPricing, setBorrowerRate } from "./loan.admin.service";

import {
  disburseApplication,
  reviewApplication,
} from "./loan.workflow.service";

export const loanRouter = Router();

const uuid = z.string().uuid();
const pageParam = z.coerce.number().int().min(1).max(100000);

const accountKind = z.enum(["GCASH", "MAYA", "BANK"]);
const staff = requireRole("REVIEWER", "ADMIN");

const paymentSelect = {
  id: true,
  amount: true,
  status: true,
  method: true,
  reference: true,
  rejectionReason: true,
  createdAt: true,
} as const;

/** Adds the approved-only statement summary to a loan, and drops the raw payment list. */
function withSummary<
  T extends { quote: unknown; payments: Parameters<typeof buildLedger>[1] }
>(loan: T) {
  const { payments, ...rest } = loan;
  const ledger = buildLedger(
    loan.quote as Parameters<typeof buildLedger>[0],
    payments
  );
  const { installments: _installments, ...summary } = ledger;
  return { ...rest, summary };
}

// Every loan endpoint requires authentication.
loanRouter.use(authenticate);

// The loan module is demo-only (mock payments, no lender licence review) outside local use.
loanRouter.use((_req, _res, next) => {
  if (env.isProd && !env.DEMO_LOANS_ENABLED) {
    throw new ApiError(
      503,
      "Loan module is demo-only until lender and product review is complete",
      "LOANS_NOT_LIVE"
    );
  }

  next();
});

// ---------------------------------------------------------------- borrower

// GET /api/loans/pricing — the logged-in user's current pricing.
loanRouter.get("/pricing", async (req, res) => {
  const policy = await prisma.loanPricingPolicy.findFirst({
    orderBy: { version: "desc" },
  });

  if (!policy) {
    throw new ApiError(
      503,
      "An admin must configure product pricing first",
      "LOAN_POLICY_REQUIRED"
    );
  }

  const override = await prisma.borrowerRateOverride.findUnique({
    where: { userId: req.user!.id },
  });

  res.json({
    demoOnly: true,

    policyId: policy.id,
    policyVersion: policy.version,

    rateSource: override ? "BORROWER_OVERRIDE" : "PRODUCT_DEFAULT",

    monthlyRatePercent: (
      override?.monthlyRatePercent ?? policy.monthlyRatePercent
    ).toFixed(6),

    processingFee: policy.processingFee.toFixed(2),
    dstPayer: policy.dstPayer,
  });
});

// POST /api/loans/calculator — manual rates are simulations only.
loanRouter.post("/calculator", validate(calculatorSchema), async (req, res) => {
  const input = req.body as z.infer<typeof calculatorSchema>;

  const { policy, rateSource, quote } = await quoteLoan(
    req.user!.id,
    {
      principal: input.principal,
      termMonths: input.termMonths,
      startDate: input.startDate,
    },
    {
      simulationRate: input.monthlyRatePercent,
      method: input.method,
    }
  );

  res.json({
    policyId: policy.id,
    rateSource,
    ...quote,
  });
});

// POST /api/loans/applications — requires verified mobile and approved KYC.
loanRouter.post(
  "/applications",
  requireRole("BORROWER"),
  validate(applicationSchema),
  async (req, res) => {
    const input = req.body as z.infer<typeof applicationSchema>;

    const result = await submitApplication(req.user!.id, input);

    res.status(result.replayed ? 200 : 201).json(result);
  }
);

// GET /api/loans/applications?page=1 — borrowers see only their own applications.
loanRouter.get("/applications", requireRole("BORROWER"), async (req, res) => {
  const page = pageParam.parse(req.query.page ?? 1);
  const pageSize = 20;

  const items = await prisma.loanApplication.findMany({
    where: { userId: req.user!.id },
    include: { payments: { select: paymentSelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  res.json({ items: items.map(withSummary), page, pageSize });
});

// GET /api/loans/applications/:id
loanRouter.get(
  "/applications/:id",
  requireRole("BORROWER"),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.json(await getLoanStatement(id, req.user!.id));
  }
);

// GET /api/loans/payment-info — where to send money, and which methods this borrower may use.
loanRouter.get("/payment-info", requireRole("BORROWER"), async (req, res) => {
  res.json(await getPaymentInfo(req.user!.id));
});

// GET /api/loans/payment-accounts/:kind/qr — the QR image for a receiving account.
loanRouter.get("/payment-accounts/:kind/qr", async (req, res) => {
  const kind = accountKind.parse(req.params.kind);
  const account = await prisma.receivingAccount.findUnique({ where: { kind } });
  const file =
    account?.active && account.qrKey ? await readFile(account.qrKey) : null;
  if (!file) throw ApiError.notFound("QR code not available");
  res.setHeader(
    "Content-Type",
    account!.qrKey!.endsWith(".png") ? "image/png" : "image/jpeg"
  );
  res.setHeader("Cache-Control", "private, max-age=60");
  res.send(file);
});

// POST /api/loans/applications/:id/payments — "I paid": goes to approval, not to the books.
loanRouter.post(
  "/applications/:id/payments",
  requireRole("BORROWER"),
  validate(submitPaymentSchema),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    const result = await submitPayment(
      req.user!.id,
      id,
      req.body as z.infer<typeof submitPaymentSchema>
    );
    res.status(201).json(result);
  }
);

// ------------------------------------------------------------------- admin

// GET /api/loans/admin/applications?status=SUBMITTED&page=1
loanRouter.get(
  "/admin/applications",
  requireRole("ADMIN"),
  async (req, res) => {
    const status = z
      .enum(["SUBMITTED", "APPROVED", "REJECTED", "DISBURSED", "REPAID"])
      .optional()
      .parse(req.query.status || undefined);
    const page = pageParam.parse(req.query.page ?? 1);
    const pageSize = 25;

    const items = await prisma.loanApplication.findMany({
      where: status ? { status } : undefined,
      include: {
        user: {
          select: {
            mobileNumber: true,
            kycProfile: { select: { fullName: true } },
          },
        },
        payments: { select: paymentSelect },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    res.json({ items: items.map(withSummary), page, pageSize });
  }
);

// PATCH /api/loans/admin/applications/:id/review — approve or reject.
loanRouter.patch(
  "/admin/applications/:id/review",
  requireRole("ADMIN"),
  validate(reviewApplicationSchema),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    const application = await reviewApplication(
      req.user!.id,
      id,
      req.body as z.infer<typeof reviewApplicationSchema>
    );
    res.json({ application });
  }
);

// POST /api/loans/admin/applications/:id/disburse — release funds (mock).
loanRouter.post(
  "/admin/applications/:id/disburse",
  requireRole("ADMIN"),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.json(await disburseApplication(req.user!.id, id));
  }
);

// GET /api/loans/admin/policies — current and previous product pricing versions.
loanRouter.get("/admin/policies", requireRole("ADMIN"), async (_req, res) => {
  const items = await prisma.loanPricingPolicy.findMany({
    orderBy: { version: "desc" },
    take: 20,
  });
  res.json({ items });
});

// POST /api/loans/admin/policies — only ADMIN can create product-default pricing.
loanRouter.post(
  "/admin/policies",
  requireRole("ADMIN"),
  validate(policySchema),
  async (req, res) => {
    const input = req.body as z.infer<typeof policySchema>;
    const policy = await createProductPricing(req.user!.id, input);
    res.status(201).json({ demoOnly: true, policy });
  }
);

// GET /api/loans/admin/borrowers — borrowers with their custom rate, if any.
loanRouter.get("/admin/borrowers", requireRole("ADMIN"), async (_req, res) => {
  const items = await prisma.user.findMany({
    where: { role: "BORROWER" },
    select: {
      id: true,
      mobileNumber: true,
      kycStatus: true,
      chequeAllowed: true,
      createdAt: true,
      kycProfile: { select: { fullName: true } },
      rateOverride: { select: { monthlyRatePercent: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ items });
});

// PUT /api/loans/admin/borrowers/:userId/rate — set or remove a borrower override.
loanRouter.put(
  "/admin/borrowers/:userId/rate",
  requireRole("ADMIN"),
  validate(overrideSchema),
  async (req, res) => {
    const userId = uuid.parse(req.params.userId);
    const input = req.body as z.infer<typeof overrideSchema>;
    const result = await setBorrowerRate(req.user!.id, userId, input);
    res.json({ demoOnly: true, ...result });
  }
);

// ------------------------------------------------- payment approval (staff)

// GET /api/loans/admin/payments?status=PENDING&page=1 — admin or reviewer.
loanRouter.get("/admin/payments", staff, async (req, res) => {
  const status = z
    .enum(["PENDING", "APPROVED", "REJECTED"])
    .default("PENDING")
    .parse(req.query.status || undefined);
  const page = pageParam.parse(req.query.page ?? 1);
  res.json(await listPaymentsForStaff(status, page));
});

// PATCH /api/loans/admin/payments/:id/review — approve (received) or reject (not received).
loanRouter.patch(
  "/admin/payments/:id/review",
  staff,
  validate(reviewPaymentSchema),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.json(
      await reviewPayment(
        req.user!.id,
        id,
        req.body as z.infer<typeof reviewPaymentSchema>
      )
    );
  }
);

// GET /api/loans/admin/applications/:id/statement — what was paid, what is left.
loanRouter.get("/admin/applications/:id/statement", staff, async (req, res) => {
  const id = uuid.parse(req.params.id);
  res.json(await getLoanStatement(id));
});

// --------------------------------------- receiving accounts + cheque (admin)

// GET /api/loans/admin/payment-accounts
loanRouter.get(
  "/admin/payment-accounts",
  requireRole("ADMIN"),
  async (_req, res) => {
    const items = await prisma.receivingAccount.findMany({
      orderBy: { kind: "asc" },
    });
    res.json({
      items: items.map(({ qrKey, ...a }) => ({ ...a, hasQr: !!qrKey })),
    });
  }
);

// PUT /api/loans/admin/payment-accounts/:kind — create or update the account details.
loanRouter.put(
  "/admin/payment-accounts/:kind",
  requireRole("ADMIN"),
  validate(receivingAccountSchema),
  async (req, res) => {
    const kind = accountKind.parse(req.params.kind);
    const input = req.body as z.infer<typeof receivingAccountSchema>;
    const data = {
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      bankName: kind === "BANK" ? input.bankName || null : null,
      instructions: input.instructions || null,
      active: input.active,
    };
    const { qrKey, ...account } = await prisma.receivingAccount.upsert({
      where: { kind },
      create: { kind, ...data },
      update: data,
    });
    res.json({ account: { ...account, hasQr: !!qrKey } });
  }
);

// POST /api/loans/admin/payment-accounts/:kind/qr — upload the QR image (JPEG or PNG).
loanRouter.post(
  "/admin/payment-accounts/:kind/qr",
  requireRole("ADMIN"),
  qrUpload,
  async (req, res) => {
    const kind = accountKind.parse(req.params.kind);
    if (kind === "BANK")
      throw ApiError.badRequest("Bank accounts do not use a QR code");

    const account = await prisma.receivingAccount.findUnique({
      where: { kind },
    });
    if (!account)
      throw ApiError.conflict(
        "Save the account details first, then upload the QR"
      );

    const file = req.file;
    const ext = file ? detectImageExt(file.buffer) : null;
    if (!file || !ext) throw ApiError.badRequest("Upload a JPEG or PNG image");

    const key = await saveFile(file.buffer, "qr", ext);
    await prisma.receivingAccount.update({
      where: { kind },
      data: { qrKey: key },
    });
    if (account.qrKey) await removeFile(account.qrKey);

    res.status(201).json({ ok: true });
  }
);

// PUT /api/loans/admin/borrowers/:userId/cheque — switch cheque payments on/off for one borrower.
loanRouter.put(
  "/admin/borrowers/:userId/cheque",
  requireRole("ADMIN"),
  validate(chequeToggleSchema),
  async (req, res) => {
    const userId = uuid.parse(req.params.userId);
    const { allowed } = req.body as z.infer<typeof chequeToggleSchema>;
    const user = await prisma.user.findFirst({
      where: { id: userId, role: "BORROWER" },
      select: { id: true },
    });
    if (!user) throw ApiError.notFound("Borrower not found");
    await prisma.user.update({
      where: { id: userId },
      data: { chequeAllowed: allowed },
    });
    res.json({ userId, chequeAllowed: allowed });
  }
);
