import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { kycUpload } from "../../middleware/upload";
import * as c from "./kyc.controller";
import { kycSubmitSchema, kycReviewSchema } from "./kyc.schemas";

export const kycRouter = Router();
kycRouter.use(authenticate);

// Borrower. Order matters: multer parses the multipart body first, then zod validates the text fields.
kycRouter.post(
  "/submit",
  requireRole("BORROWER"),
  (_req, _res, next) => {
    if (!env.KYC_UPLOADS_ENABLED) throw new ApiError(503, "KYC uploads are not configured", "KYC_UNAVAILABLE");
    next();
  },
  kycUpload,
  validate(kycSubmitSchema),
  c.submit
);
kycRouter.get("/me", c.myStatus);

// Reviewer / admin. "pending" must be declared before ":userId".
const staff = requireRole("REVIEWER", "ADMIN");
kycRouter.get("/admin/pending", staff, c.listPending);
kycRouter.get("/admin/:userId", staff, c.getForReview);
kycRouter.get("/admin/:userId/image/:type", staff, c.getImage);
kycRouter.patch(
  "/admin/:userId/review",
  staff,
  validate(kycReviewSchema),
  c.review
);
