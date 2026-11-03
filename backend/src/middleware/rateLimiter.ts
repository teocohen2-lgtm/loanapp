import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Production limits are strict; local development gets headroom for manual testing.
const scale = env.isProd ? 1 : 50;

const baseOptions = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
};

/** Applied to every route. */
export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300 * scale,
});

/** Stricter limiter for login / register (used in Phase 2). */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10 * scale,
});

/** Strictest limiter for OTP send/verify (used in Phase 2). Prevents SMS-pumping abuse. */
export const otpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 5 * scale,
});
