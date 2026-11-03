import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import * as service from "./auth.service";

// In dev the mock OTP is also returned in the response so you can test without reading logs
const devOtp = (code?: string) => (!env.isProd && code ? { devOtp: code } : {});

export const register: RequestHandler = async (req, res) => {
  const { user, code } = await service.register(req.body);
  res.status(201).json({
    message: "Account created. Enter the code sent to your mobile number.",
    mobileNumber: user.mobileNumber,
    ...devOtp(code),
  });
};

export const verifyOtp: RequestHandler = async (req, res) => {
  const { user, token } = await service.verifySignup(
    req.body.mobileNumber,
    req.body.code
  );
  res.json({ token, user: service.publicUser(user) });
};

export const resendOtp: RequestHandler = async (req, res) => {
  const code = await service.resendSignupOtp(req.body.mobileNumber);
  res.json({
    message: "If the number is registered and unverified, a new code was sent.",
    ...devOtp(code),
  });
};

export const login: RequestHandler = async (req, res) => {
  const { user, token } = await service.login(
    req.body.mobileNumber,
    req.body.password
  );
  res.json({ token, user: service.publicUser(user) });
};

export const me: RequestHandler = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw ApiError.notFound();
  res.json({ user: service.publicUser(user) });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const code = await service.forgotPassword(req.body.mobileNumber);
  res.json({
    message: "If the number is registered, a reset code was sent.",
    ...devOtp(code),
  });
};

export const resetPassword: RequestHandler = async (req, res) => {
  await service.resetPassword(
    req.body.mobileNumber,
    req.body.code,
    req.body.newPassword
  );
  res.json({ message: "Password updated. You can now sign in." });
};
