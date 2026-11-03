import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw ApiError.unauthorized("Missing token");

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }

  // Check the DB so deleted users or changed roles take effect immediately
  const user = await prisma.user.findUnique({
    where: { id: String(payload.sub) },
    select: { id: true, role: true },
  });
  if (!user) throw ApiError.unauthorized("Account no longer exists");

  req.user = user;
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
