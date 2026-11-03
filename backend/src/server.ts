import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./lib/prisma";

async function main() {
  // Fail fast if the database is unreachable
  await prisma.$connect();
  logger.info("Database connected");

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Render sends SIGTERM on redeploy: stop accepting requests, finish in-flight ones, close DB
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force-quit if stuck
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
