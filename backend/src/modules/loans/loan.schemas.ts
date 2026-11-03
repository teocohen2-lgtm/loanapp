import { z } from "zod";
import {
  LOAN_LIMITS,
  validateDisbursement,
  type PaymentMethodValue,
} from "../../config/ph";

// Money must arrive as a decimal string, e.g. "10000.00".
// The calculation engine checks amount limits and net proceeds.
const amount = z
  .string()
  .regex(
    /^\d{1,6}(\.\d{1,2})?$/,
    "Use a decimal string with at most two decimal places"
  );

// Percent per MONTH: "1.00" means 1% monthly.
// This is a demo restriction, not a universal legal limit.
export const rate = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,6})?$/, "Enter a monthly percentage, e.g. 1.00")
  .refine(
    (value) => Number(value) <= 6,
    "The demo supports rates up to 6% monthly"
  );

// Common calculation inputs.
// Calendar validity is checked by the calculation engine.
export const requestSchema = z
  .object({
    principal: amount,

    termMonths: z
      .number()
      .int()
      .min(LOAN_LIMITS.minTermMonths)
      .max(LOAN_LIMITS.maxTermMonths),

    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  })
  .strict();

// Calculator users may simulate a different rate.
// This does not change actual application pricing.
export const calculatorSchema = requestSchema
  .extend({
    monthlyRatePercent: rate.optional(),

    method: z.enum(["DIMINISHING", "FLAT_SIMULATION"]).default("DIMINISHING"),
  })
  .strict();

// Application pricing comes from the server.
// Extra fields such as interest rate, fees or userId are rejected.
export const paymentMethodSchema = z.enum(["GCASH", "MAYA", "INSTAPAY", "PESONET"]);

export const applicationSchema = requestSchema
  .extend({
    requestKey: z.string().uuid("requestKey must be a UUID"),

    // Where the loan proceeds are sent. E-wallets use a PH mobile number;
    // InstaPay/PESONet use a bank code and account number.
    disbursementMethod: paymentMethodSchema,
    disbursementAccount: z.string().trim().min(1).max(40),
    disbursementBankCode: z.string().trim().max(10).optional(),
  })
  .strict()
  .transform((v, ctx) => {
    const result = validateDisbursement({
      method: v.disbursementMethod as PaymentMethodValue,
      account: v.disbursementAccount,
      bankCode: v.disbursementBankCode,
    });
    if (!result.ok) {
      ctx.addIssue({ code: "custom", path: ["disbursementAccount"], message: result.message });
      return z.NEVER;
    }
    return {
      ...v,
      disbursementAccount: result.account,
      disbursementBankCode: result.bankCode,
    };
  });

export const repaymentSchema = z.object({ method: paymentMethodSchema }).strict();

export const reviewApplicationSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict()
  .refine((v) => v.decision === "APPROVED" || !!v.reason, {
    message: "A reason is required when rejecting",
    path: ["reason"],
  });

// Admin-only endpoint will use this schema
// to create a new product-pricing version.
export const policySchema = z
  .object({
    monthlyRatePercent: rate,

    processingFee: amount,

    dstPayer: z.enum(["LENDER", "BORROWER"]).default("LENDER"),

    reason: z.string().trim().min(10, "Explain the pricing change").max(500),
  })
  .strict();

// null removes the custom rate and restores product-default pricing.
// Access control will be enforced by the admin route.
export const overrideSchema = z
  .object({
    monthlyRatePercent: rate.nullable(),

    reason: z.string().trim().min(10, "Explain the pricing change").max(500),
  })
  .strict();
