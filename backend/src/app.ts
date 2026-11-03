import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./lib/prisma";
import { globalLimiter } from "./middleware/rateLimiter";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { kycRouter } from "./modules/kyc/kyc.routes";
import { loanRouter } from "./modules/loans/loan.routes";
import { metaRouter } from "./modules/meta/meta.routes";
import { reportRouter } from "./modules/reports/report.routes";

export const app = express();

// Render sits behind a reverse proxy; needed for correct client IPs (rate limiting, audit logs)
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } })
);
// app.use(helmet());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // The KYC review screen shows protected photos as blob: object URLs.
        "img-src": ["'self'", "data:", "blob:"],
      },
    },
  })
);

// // Strict CORS allowlist (no wildcard, since we'll send Authorization headers)
// app.use(
//   cors({
//     origin(origin, cb) {
//       // No Origin header = curl, server-to-server, Render health checks
//       if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
//       cb(new Error("CORS_NOT_ALLOWED"));
//     },
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
//     allowedHeaders: ["Content-Type", "Authorization", "X-Report-Truncated"],
//     maxAge: 600,
//   })
// );

// Strict CORS allowlist (no wildcard, since we send Authorization headers).
// Requests from this server's own origin are always allowed: browsers attach an Origin
// header to same-origin POSTs, which matters when SERVE_FRONTEND=true.
app.use(
  cors((req, cb) => {
    const origin = req.header("Origin");
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    // No Origin header = curl, server-to-server, Render health checks
    const allowed = !origin || sameOrigin || env.corsOrigins.includes(origin);
    const options = {
      origin: allowed,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: [
        "Content-Disposition",
        "X-Report-Rows",
        "X-Report-Truncated",
      ],
      maxAge: 600,
    };
    cb(allowed ? null : new Error("CORS_NOT_ALLOWED"), options);
  })
);

app.use(globalLimiter);
// Small JSON limit. KYC images arrive as multipart via Multer in Phase 2, not JSON.
app.use(express.json({ limit: "100kb" }));

// Liveness: is the process up? (Render health check)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Readiness: can we reach the database?
app.get("/health/db", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`; // a throw here goes to errorHandler (Express 5)
  res.json({ status: "ok", database: "connected" });
});

app.use("/api/meta", metaRouter);
app.use("/api/auth", authRouter);
app.use("/api/kyc", kycRouter);
app.use("/api/loans", loanRouter);
app.use("/api/admin/reports", reportRouter);

// Optional: serve the built React app from the same server (single Render service).
if (env.SERVE_FRONTEND) {
  const dist = path.resolve(__dirname, "../../frontend/dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path.startsWith("/api") ||
      req.path.startsWith("/health")
    )
      return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}
app.use(notFoundHandler);
app.use(errorHandler);
