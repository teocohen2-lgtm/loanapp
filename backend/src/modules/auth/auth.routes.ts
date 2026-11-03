import { Router } from "express";
import { authLimiter, otpLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import * as c from "./auth.controller";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schemas";

export const authRouter = Router();

authRouter.post("/register", authLimiter, validate(registerSchema), c.register);
authRouter.post(
  "/verify-otp",
  otpLimiter,
  validate(verifyOtpSchema),
  c.verifyOtp
);
authRouter.post(
  "/resend-otp",
  otpLimiter,
  validate(resendOtpSchema),
  c.resendOtp
);
authRouter.post("/login", authLimiter, validate(loginSchema), c.login);
authRouter.get("/me", authenticate, c.me);

authRouter.post(
  "/forgot-password",
  otpLimiter,
  validate(forgotPasswordSchema),
  c.forgotPassword
);
authRouter.post(
  "/reset-password",
  otpLimiter,
  validate(resetPasswordSchema),
  c.resetPassword
);
