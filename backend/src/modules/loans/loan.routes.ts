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
  repaymentSchema,
  reviewApplicationSchema,
} from "./loan.schemas";

import { getMyApplication, quoteLoan, submitApplication } from "./loan.service";

import { createProductPricing, setBorrowerRate } from "./loan.admin.service";

import {
  disburseApplication,
  payNextInstallment,
  reviewApplication,
} from "./loan.workflow.service";

export const loanRouter = Router();

const uuid = z.string().uuid();
const pageParam = z.coerce.number().int().min(1).max(100000);

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
    include: { repayments: { select: { installmentNo: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  res.json({ items, page, pageSize });
});

// GET /api/loans/applications/:id
loanRouter.get(
  "/applications/:id",
  requireRole("BORROWER"),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    const application = await getMyApplication(req.user!.id, id);
    res.json({ application });
  }
);

// POST /api/loans/applications/:id/payments — pay the next installment (mock rails).
loanRouter.post(
  "/applications/:id/payments",
  requireRole("BORROWER"),
  validate(repaymentSchema),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { method } = req.body as z.infer<typeof repaymentSchema>;

    const result = await payNextInstallment(req.user!.id, id, method);
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
        repayments: { select: { installmentNo: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    res.json({ items, page, pageSize });
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
