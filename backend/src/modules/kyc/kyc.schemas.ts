import { z } from "zod";
import { ID_TYPE_VALUES, normalizeIdNumber } from "../../config/ph";

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

export const kycSubmitSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .refine((d) => {
        const age = (Date.now() - new Date(d).getTime()) / MS_PER_YEAR;
        return age >= 18 && age <= 100;
      }, "Borrower must be at least 18 years old"),
    address: z
      .string()
      .trim()
      .min(10, "Please enter your complete address")
      .max(300),
    idType: z.enum(ID_TYPE_VALUES),
    idNumber: z.string().trim().min(5, "Enter your ID number").max(40),
  })
  .transform((v, ctx) => {
    // Canonical form (no spaces/hyphens) so the stored last-4 is consistent.
    const idNumber = normalizeIdNumber(v.idType, v.idNumber);
    if (!idNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["idNumber"],
        message: "ID number does not match the format of the selected ID type",
      });
      return z.NEVER;
    }
    return { ...v, idNumber };
  });

export const kycReviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .refine((v) => v.decision === "APPROVED" || !!v.reason, {
    message: "A reason is required when rejecting",
    path: ["reason"],
  });
