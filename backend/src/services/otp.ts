import crypto from "crypto";
import type { OtpPurpose, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { hashOtp, safeEqual } from "../utils/crypto";
import { assertSmsAvailable, sendOtpSms } from "./mock/sms";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Serialize all OTP operations for this user across API processes. */
async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

export async function issueOtp(
  user: { id: string; mobileNumber: string },
  purpose: OtpPurpose
): Promise<string> {
  assertSmsAvailable();
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const last = await tx.otpCode.findFirst({
      where: { userId: user.id, purpose },
      orderBy: { createdAt: "desc" },
    });
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS)
      throw new ApiError(
        429,
        "Please wait a minute before requesting another code",
        "OTP_COOLDOWN"
      );
    await tx.otpCode.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.otpCode.create({
      data: {
        userId: user.id,
        purpose,
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
  });
  try {
    await sendOtpSms(user.mobileNumber, code);
  } catch (err) {
    // A code that was never delivered must not block the 60-second resend window.
    await prisma.otpCode.deleteMany({
      where: { userId: user.id, purpose, codeHash: hashOtp(code) },
    });
    throw err;
  }
  return code;
}

/** Return failed attempts from the transaction so their increments are committed. */
export async function verifyOtp(
  userId: string,
  purpose: OtpPurpose,
  code: string
): Promise<void> {
  const valid = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const otp = await tx.otpCode.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) return false;
    const matches = safeEqual(otp.codeHash, hashOtp(code));
    await tx.otpCode.update({
      where: { id: otp.id },
      data: {
        attempts: { increment: 1 },
        ...(matches ? { consumedAt: new Date() } : {}),
      },
    });
    // Verification and consumption must commit together.
    if (matches && purpose === "SIGNUP")
      await tx.user.update({
        where: { id: userId },
        data: { isMobileVerified: true },
      });
    return matches;
  });
  if (!valid)
    throw ApiError.badRequest(
      "Code is invalid or expired. Please request a new one."
    );
}
