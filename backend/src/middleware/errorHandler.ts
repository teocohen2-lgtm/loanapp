import multer from "multer";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { env } from "../config/env";

/** 404 for any route that didn't match. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/** Must be registered LAST. The 4-arg signature is required by Express. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong";
  let details: unknown;

  if (err instanceof ApiError) {
    ({ statusCode: status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request data";
    details = err.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      status = 409;
      code = "DUPLICATE";
      message = "A record with that value already exists";
    } else if (err.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
      message = "Record not found";
    }
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Malformed JSON body";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body too large";
  } else if (err?.message === "CORS_NOT_ALLOWED") {
    status = 403;
    code = "CORS_NOT_ALLOWED";
    message = "Origin not allowed";
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = err.code;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large (max 5 MB)"
        : "Invalid file upload";
  }

  // Log server faults with the stack; client faults at warn level without it.
  if (status >= 500) {
    logger.error(
      { err, path: req.originalUrl, method: req.method },
      "Unhandled error"
    );
  } else {
    logger.warn({ code, status, path: req.originalUrl }, message);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      // Stack traces only in development
      ...(!env.isProd && status >= 500 ? { stack: err?.stack } : {}),
    },
  });
};
