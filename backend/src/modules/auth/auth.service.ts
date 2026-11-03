import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { issueOtp, verifyOtp } from "../../services/otp";

import { assertSmsAvailable } from "../../services/mock/sms";

const BCRYPT_COST = 12;
// Compared against when the user doesn't exist, so response time doesn't reveal valid numbers
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_COST);

export function signToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Strips secrets before sending a user to the client. */
export function publicUser(u: User) {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

export async function register(input: {
  mobileNumber: string;
  password: string;
  email?: string;
}) {
  assertSmsAvailable();
  const existing = await prisma.user.findUnique({
    where: { mobileNumber: input.mobileNumber },
  });
  if (existing)
    throw ApiError.conflict("This mobile number is already registered");

  const user = await prisma.user.create({
    data: {
      mobileNumber: input.mobileNumber,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    },
  });
  const code = await issueOtp(user, "SIGNUP");
  return { user, code };
}

export async function verifySignup(mobileNumber: string, code: string) {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user)
    throw ApiError.badRequest(
      "Code is invalid or expired. Please request a new one."
    );

  await verifyOtp(user.id, "SIGNUP", code);
  const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { user: verified, token: signToken(verified) };
}

/** Always succeeds from the caller's view, so it can't be used to discover registered numbers. */
export async function resendSignupOtp(
  mobileNumber: string
): Promise<string | undefined> {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user || user.isMobileVerified) return undefined;
  return issueOtp(user, "SIGNUP");
}

export async function login(mobileNumber: string, password: string) {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok)
    throw ApiError.unauthorized("Invalid mobile number or password");

  if (!user.isMobileVerified) {
    throw new ApiError(
      403,
      "Please verify your mobile number first",
      "MOBILE_NOT_VERIFIED"
    );
  }
  return { user, token: signToken(user) };
}

/** Always succeeds from the caller's view so registered numbers cannot be discovered. */
export async function forgotPassword(
  mobileNumber: string
): Promise<string | undefined> {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user || !user.isMobileVerified) return undefined;
  try {
    return await issueOtp(user, "RESET");
  } catch (err) {
    // A cooldown error would reveal that the number exists; treat it as success.
    if (err instanceof ApiError && err.code === "OTP_COOLDOWN") return undefined;
    throw err;
  }
}

export async function resetPassword(
  mobileNumber: string,
  code: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user || !user.isMobileVerified)
    throw ApiError.badRequest("Code is invalid or expired. Please request a new one.");

  await verifyOtp(user.id, "RESET", code);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST) },
  });
}
