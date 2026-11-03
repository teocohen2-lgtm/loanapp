import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { encrypt } from "../utils/crypto";
import * as storage from "../services/storage";

/**
 * Local development seed. Safe to re-run: it resets the demo accounts' passwords
 * and roles, and creates the default pricing policy only if none exists.
 * Refuses to run in production because the passwords below are public.
 */

const ACCOUNTS = [
  { mobile: "+639170000001", password: "Admin#12345", role: "ADMIN", label: "Admin" },
  { mobile: "+639170000002", password: "Reviewer#12345", role: "REVIEWER", label: "KYC reviewer" },
  { mobile: "+639170000003", password: "Borrower#12345", role: "BORROWER", label: "Borrower (KYC approved)" },
  { mobile: "+639170000004", password: "Newbie#12345", role: "BORROWER", label: "Borrower (no KYC yet)" },
] as const;

// Smallest valid PNG (1x1 pixel): placeholder for seeded KYC photos.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  if (env.isProd) {
    console.error("Refusing to seed demo accounts with NODE_ENV=production.");
    process.exit(1);
  }

  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(a.password, 12);
    const user = await prisma.user.upsert({
      where: { mobileNumber: a.mobile },
      create: { mobileNumber: a.mobile, passwordHash, role: a.role, isMobileVerified: true },
      update: { passwordHash, role: a.role, isMobileVerified: true },
    });
    ids[a.mobile] = user.id;
  }

  const adminId = ids["+639170000001"];
  const reviewerId = ids["+639170000002"];
  const borrowerId = ids["+639170000003"];

  const hasKyc = await prisma.kycProfile.findUnique({ where: { userId: borrowerId } });
  if (!hasKyc) {
    const idImageKey = await storage.saveFile(PNG_1X1, `kyc/${borrowerId}`, "png");
    const selfieImageKey = await storage.saveFile(PNG_1X1, `kyc/${borrowerId}`, "png");
    await prisma.$transaction([
      prisma.kycProfile.create({
        data: {
          userId: borrowerId,
          fullName: "Juan Dela Cruz",
          birthDate: new Date("1995-05-15"),
          address: "123 Rizal Street, Barangay Poblacion, Makati City, Metro Manila",
          idType: "UMID",
          idNumberEnc: encrypt("012345678901"),
          idNumberLast4: "8901",
          idImageKey,
          selfieImageKey,
          status: "APPROVED",
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      }),
      prisma.user.update({ where: { id: borrowerId }, data: { kycStatus: "APPROVED" } }),
    ]);
  } else {
    await prisma.user.update({ where: { id: borrowerId }, data: { kycStatus: hasKyc.status } });
  }

  const policy = await prisma.loanPricingPolicy.findFirst({ orderBy: { version: "desc" } });
  if (!policy) {
    const created = await prisma.loanPricingPolicy.create({
      data: {
        monthlyRatePercent: "3.000000",
        processingFee: "50.00",
        dstPayer: "LENDER",
        reason: "Initial local demo pricing (3% monthly, PHP 50 fee)",
        createdById: adminId,
      },
    });
    await prisma.loanPricingAudit.create({
      data: {
        actorId: adminId,
        action: "CREATE_PRODUCT_VERSION",
        after: {
          policyId: created.id,
          version: created.version,
          monthlyRatePercent: "3.000000",
          processingFee: "50.00",
          dstPayer: "LENDER",
        },
        reason: "Seed: initial local demo pricing",
      },
    });
  }

  console.log("\nSeed complete. Demo accounts:\n");
  for (const a of ACCOUNTS)
    console.log(`  ${a.label.padEnd(26)} 0${a.mobile.slice(3)}   ${a.password}`);
  console.log("\nDefault pricing: 3.00% per month, PHP 50.00 processing fee.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
