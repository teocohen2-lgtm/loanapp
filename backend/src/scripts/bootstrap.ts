import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { normalizePhMobile } from "../utils/phone";

/**
 * Idempotent startup task for hosted test environments (runs on every deploy).
 * Creates or updates staff accounts from environment variables, so no password is
 * ever written in the code, and creates the default pricing once if none exists.
 *
 *   ADMIN_MOBILE / ADMIN_PASSWORD         (optional pair)
 *   REVIEWER_MOBILE / REVIEWER_PASSWORD   (optional pair)
 *  BORROWER_MOBILE / BORROWER_PASSWORD   (optional pair; also BORROWER2_*, BORROWER3_* ... up to 5)
 *                                         Verified borrower accounts for use while SMS is not active.
 *                                         They still complete KYC and need reviewer approval.
 *
 * The environment is the source of truth: changing a password there and redeploying resets it.
 */
async function upsertStaff(
  label: string,
  mobileRaw: string | undefined,
  password: string | undefined,
  role: "ADMIN" | "REVIEWER" | "BORROWER"
): Promise<string | null> {
  if (!mobileRaw && !password) return null;
  const mobile = mobileRaw ? normalizePhMobile(mobileRaw) : null;
  if (
    !mobile ||
    !password ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    console.error(
      `${label}: set BOTH a valid PH mobile number and a password of 8 to 72 characters.`
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { mobileNumber: mobile },
    create: {
      mobileNumber: mobile,
      passwordHash,
      role,
      isMobileVerified: true,
    },
    // update: { passwordHash, role, isMobileVerified: true },

    // Never change the role of an existing account when seeding a borrower.
    update:
      role === "BORROWER"
        ? { passwordHash, isMobileVerified: true }
        : { passwordHash, role, isMobileVerified: true },
  });
  console.log(`${label} account ready (${mobile}).`);
  return user.id;
}

async function main() {
  const env = process.env;
  const adminId = await upsertStaff(
    "Admin",
    env.ADMIN_MOBILE,
    env.ADMIN_PASSWORD,
    "ADMIN"
  );
  await upsertStaff(
    "Reviewer",
    env.REVIEWER_MOBILE,
    env.REVIEWER_PASSWORD,
    "REVIEWER"
  );

  for (let n = 1; n <= 5; n++) {
    const prefix = n === 1 ? "BORROWER" : `BORROWER${n}`;
    await upsertStaff(
      `Borrower ${n}`,
      env[`${prefix}_MOBILE`],
      env[`${prefix}_PASSWORD`],
      "BORROWER"
    );
  }

  const hasPolicy = await prisma.loanPricingPolicy.findFirst();
  if (hasPolicy) return;

  const creatorId =
    adminId ??
    (
      await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      })
    )?.id;
  if (!creatorId) {
    console.log(
      "No pricing policy yet and no admin to own it: set ADMIN_MOBILE and ADMIN_PASSWORD."
    );
    return;
  }
  const policy = await prisma.loanPricingPolicy.create({
    data: {
      monthlyRatePercent: "3.000000",
      processingFee: "50.00",
      dstPayer: "LENDER",
      reason: "Initial test pricing (3% monthly, PHP 50 fee)",
      createdById: creatorId,
    },
  });
  await prisma.loanPricingAudit.create({
    data: {
      actorId: creatorId,
      action: "CREATE_PRODUCT_VERSION",
      after: {
        policyId: policy.id,
        version: policy.version,
        monthlyRatePercent: "3.000000",
        processingFee: "50.00",
        dstPayer: "LENDER",
      },
      reason: "Bootstrap: initial test pricing",
    },
  });
  console.log("Default pricing created: 3.00% per month, PHP 50.00 fee.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
