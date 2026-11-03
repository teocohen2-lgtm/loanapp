import { prisma } from "../lib/prisma";
import { normalizePhMobile } from "../utils/phone";

async function run() {
  const [, , raw, role = "ADMIN"] = process.argv;
  const mobile = raw && normalizePhMobile(raw);
  if (!mobile || !["ADMIN", "REVIEWER"].includes(role)) {
    console.error("Usage: npm run make-admin -- 09171234567 [ADMIN|REVIEWER]");
    process.exit(1);
  }
  const u = await prisma.user.update({
    where: { mobileNumber: mobile },
    data: { role: role as any },
  });
  console.log(`${u.mobileNumber} is now ${u.role}`);
  await prisma.$disconnect();
}
run();
