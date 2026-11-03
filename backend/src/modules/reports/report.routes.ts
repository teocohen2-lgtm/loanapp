import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../../middleware/auth";
import { logger } from "../../utils/logger";
import { buildReport, REPORT_TYPES } from "./report.service";

export const reportRouter = Router();

// Reports contain personal data: administrators only (reviewers are excluded).
reportRouter.use(authenticate, requireRole("ADMIN"));

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    // toISOString() throws on an invalid date, so check validity first.
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Not a real date");

const querySchema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    status: z
      .enum(["SUBMITTED", "APPROVED", "REJECTED", "DISBURSED", "REPAID"])
      .optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "'from' must not be after 'to'",
    path: ["from"],
  });

// GET /api/admin/reports/:type?from=2026-11-01&to=2026-11-30&status=DISBURSED
reportRouter.get("/:type", async (req, res) => {
  const type = z.enum(REPORT_TYPES).parse(req.params.type);
  // Empty strings from a blank form field count as "not provided".
  const filters = querySchema.parse(
    Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ""))
  );

  const { csv, rowCount, truncated } = await buildReport(type, filters);

  // Audit trail: who exported what.
  logger.info(
    { actorId: req.user!.id, report: type, filters, rowCount, truncated },
    "Report downloaded"
  );

  const stamp = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="pesoloan-${type}-${stamp}.csv"`
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Report-Rows", String(rowCount));
  res.setHeader("X-Report-Truncated", String(truncated));
  res.send(csv);
});
