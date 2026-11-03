import { z } from "zod";
import { normalizePhMobile } from "../../utils/phone";

const phMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhMobile(v);
    if (!n) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid PH mobile number, e.g. 09171234567",
      });
      return z.NEVER;
    }
    return n;
  });

// max 72: bcrypt ignores everything past 72 bytes
const password = z
  .string()
  .min(8, "At least 8 characters")
  .max(72)
  .refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes")
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/\d/, "Must contain a number");

export const registerSchema = z.object({
  mobileNumber: phMobile,
  password,
  email: z.string().trim().toLowerCase().email().optional(),
});

export const verifyOtpSchema = z.object({
  mobileNumber: phMobile,
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const resendOtpSchema = z.object({ mobileNumber: phMobile });

export const loginSchema = z.object({
  mobileNumber: phMobile,
  password: z.string().min(1).max(72)
  .refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes"),
});

export const forgotPasswordSchema = z.object({ mobileNumber: phMobile });

export const resetPasswordSchema = z.object({
  mobileNumber: phMobile,
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  newPassword: password,
});
