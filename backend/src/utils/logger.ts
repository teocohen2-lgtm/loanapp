import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.isProd ? "info" : "debug",
  // Never log credentials or tokens
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "*.password",
    "*.otp",
  ],
  transport: env.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
      },
});
