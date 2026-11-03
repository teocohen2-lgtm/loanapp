const { test, after } = require("node:test");
const assert = require("node:assert/strict");
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-only-jwt-secret-32-characters-long",
  ENCRYPTION_KEY: "test-only-encryption-secret-32-characters",
});
const { prisma } = require("../dist/lib/prisma");
after(() => prisma.$disconnect());
const {
  normalizeIdNumber,
  validateDisbursement,
} = require("../dist/config/ph");
const { calculateLoan } = require("../dist/modules/loan-engine/loan-engine");
const { kycSubmitSchema } = require("../dist/modules/kyc/kyc.schemas");
const { applicationSchema } = require("../dist/modules/loans/loan.schemas");
const { normalizePhMobile } = require("../dist/utils/phone");

const base = {
  principal: "5000.00",
  termMonths: 3,
  monthlyRatePercent: "3.000000",
  startDate: "2026-11-03",
  processingFee: "50.00",
  dstPayer: "LENDER",
  method: "DIMINISHING",
};

test("PH mobile formats: +63, 63, 09 and spaced input; rejects landline and short numbers", () => {
  for (const v of [
    "09171234567",
    "+639171234567",
    "639171234567",
    "+63 917-123-4567",
    "9171234567",
  ])
    assert.equal(normalizePhMobile(v), "+639171234567");
  for (const v of ["0281234567", "0817123456", "+6391712345", "12345", ""])
    assert.equal(normalizePhMobile(v), null);
});

test("government ID formats are normalized and validated per type", () => {
  assert.equal(normalizeIdNumber("UMID", "0123-4567890-1"), "012345678901");
  assert.equal(normalizeIdNumber("SSS", "34-1234567-8"), "3412345678");
  assert.equal(
    normalizeIdNumber("PHILID", "1234-5678-9012-3456"),
    "1234567890123456"
  );
  assert.equal(
    normalizeIdNumber("DRIVERS_LICENSE", "n01-23-456789"),
    "N0123456789"
  );
  assert.equal(normalizeIdNumber("TIN", "123-456-789"), "123456789");
  assert.equal(normalizeIdNumber("TIN", "123-456-789-000"), "123456789000");
  assert.equal(normalizeIdNumber("PRC", "0123456"), "0123456");
  assert.equal(normalizeIdNumber("SSS", "12345"), null);
  assert.equal(normalizeIdNumber("PHILID", "123456"), null);
});

test("KYC schema accepts all six PH ID types and stores canonical number", () => {
  const ok = {
    fullName: "Juan Dela Cruz",
    birthDate: "1995-05-15",
    address: "123 Rizal St, Makati City",
  };
  const samples = {
    UMID: "0123-4567890-1",
    SSS: "34-1234567-8",
    PHILID: "1234-5678-9012-3456",
    DRIVERS_LICENSE: "N01-23-456789",
    TIN: "123-456-789",
    PRC: "0123456",
  };
  for (const [idType, idNumber] of Object.entries(samples))
    assert.ok(
      kycSubmitSchema
        .parse({ ...ok, idType, idNumber })
        .idNumber.match(/^[A-Z0-9]+$/)
    );
  assert.throws(() =>
    kycSubmitSchema.parse({ ...ok, idType: "SSS", idNumber: "123" })
  );
  assert.throws(() =>
    kycSubmitSchema.parse({
      ...ok,
      birthDate: "2015-01-01",
      idType: "PRC",
      idNumber: "0123456",
    })
  );
});

test("payout validation: GCash/Maya need PH mobile, InstaPay/PESONet need bank + account", () => {
  assert.deepEqual(
    validateDisbursement({ method: "GCASH", account: "0917 123 4567" }),
    { ok: true, account: "+639171234567", bankCode: null }
  );
  assert.equal(
    validateDisbursement({ method: "MAYA", account: "12345" }).ok,
    false
  );
  assert.deepEqual(
    validateDisbursement({
      method: "INSTAPAY",
      account: "0012-3456-7890",
      bankCode: "BDO",
    }),
    { ok: true, account: "00123456789" + "0", bankCode: "BDO" }
  );
  assert.equal(
    validateDisbursement({
      method: "PESONET",
      account: "12345678",
      bankCode: "NOPE",
    }).ok,
    false
  );
  assert.equal(
    validateDisbursement({ method: "PESONET", account: "123", bankCode: "BPI" })
      .ok,
    false
  );
});

test("application schema normalizes payout and rejects extra pricing fields", () => {
  const body = {
    principal: "5000",
    termMonths: 6,
    startDate: "2026-11-03",
    requestKey: "3f1b2c4e-1a2b-4c3d-8e9f-0123456789ab",
    disbursementMethod: "GCASH",
    disbursementAccount: "09171234567",
  };
  assert.equal(
    applicationSchema.parse(body).disbursementAccount,
    "+639171234567"
  );
  assert.throws(() => applicationSchema.parse({ ...body, termMonths: 13 }));
  assert.throws(() =>
    applicationSchema.parse({ ...body, monthlyRatePercent: "0.1" })
  );
});

test("1 to 12 month diminishing-balance loans are eligible and fully amortize", () => {
  for (let months = 1; months <= 12; months++) {
    const q = calculateLoan({ ...base, termMonths: months });
    assert.equal(q.schedule.length, months);
    assert.equal(q.schedule.at(-1).closingPrincipal, "0.00");
    assert.equal(
      q.applicationEligible,
      true,
      `month ${months}: ${q.ineligibleReasons}`
    );
    const principalSum = q.schedule.reduce(
      (t, r) => t + Number(r.principal),
      0
    );
    assert.equal(principalSum.toFixed(2), "5000.00");
  }
});

test("eligibility rejects out-of-range amounts, long terms, flat mode and excess EIR", () => {
  assert.equal(
    calculateLoan({ ...base, principal: "60000.00" }).applicationEligible,
    false
  );
  assert.throws(() => calculateLoan({ ...base, principal: "500.00" })); // below the engine's hard minimum
  assert.equal(
    calculateLoan({ ...base, termMonths: 24 }).applicationEligible,
    false
  );
  assert.equal(
    calculateLoan({ ...base, method: "FLAT_SIMULATION" }).applicationEligible,
    false
  );
  const highFee = calculateLoan({
    ...base,
    principal: "1000.00",
    termMonths: 1,
    processingFee: "300.00",
  });
  assert.equal(highFee.applicationEligible, false);
  assert.ok(highFee.ineligibleReasons.some((r) => /effective/i.test(r)));
  assert.equal(
    calculateLoan({
      ...base,
      principal: "5000.00",
      termMonths: 3,
      monthlyRatePercent: "7",
    }).applicationEligible,
    false
  );
  assert.throws(() => calculateLoan({ ...base, monthlyRatePercent: "25.01" }));
});

test("rates up to 25% are accepted for loans outside the SEC small-loan scope", () => {
  const q = calculateLoan({
    ...base,
    principal: "20000.00",
    termMonths: 6,
    monthlyRatePercent: "25",
  });
  assert.equal(q.applicableSmallLoanScope, false);
  assert.equal(q.applicationEligible, true);
  assert.equal(
    calculateLoan({
      ...base,
      principal: "20000.00",
      termMonths: 6,
      monthlyRatePercent: "7",
    }).applicationEligible,
    true
  );
});

test("default product pricing (3% monthly, PHP 50 fee) passes the 12% EIR ceiling in the worst case", () => {
  const q = calculateLoan({ ...base, principal: "1000.00", termMonths: 1 });
  assert.equal(q.applicationEligible, true);
  assert.ok(Number(q.monthlyEirPercent) < 12);
  assert.equal(q.netProceeds, "950.00");
  assert.equal(q.currency, "PHP");
});
