import { normalizePhMobile } from "../utils/phone";

/** Product limits for applications. Mirrored to the UI via GET /api/meta. */
export const LOAN_LIMITS = {
  minPrincipal: 1000,
  maxPrincipal: 50000,
  minTermMonths: 1,
  maxTermMonths: 12,
} as const;

/**
 * SEC Memorandum Circular No. 14, s. 2025 (effective 1 April 2026) caps loans of
 * PHP 10,000 or less with terms of up to 4 months. This app applies the same
 * conservative checks to every loan it offers, including larger/longer ones.
 */
export const REGULATORY_REFERENCE = {
  circular: "SEC MC No. 14, s. 2025 (effective 1 April 2026)",
  coveredPrincipalMax: 10000,
  coveredTermMonthsMax: 4,
  nominalCapPercentPerMonth: 6,
  effectiveCapPercentPerMonth: 12,
  penaltyCapPercentPerMonth: 5,
  totalCostCapPercentOfPrincipal: 100,
} as const;

export type IdTypeValue =
  | "PHILID"
  | "UMID"
  | "DRIVERS_LICENSE"
  | "SSS"
  | "TIN"
  | "PRC"
  | "PASSPORT";

type IdRule = {
  value: IdTypeValue;
  label: string;
  hint: string;
  placeholder: string;
  /** Checked after removing spaces and hyphens and upper-casing. */
  pattern: RegExp;
};

/** Formats are advisory sanity checks; a human reviewer verifies the actual ID. */
export const ID_RULES: IdRule[] = [
  {
    value: "UMID",
    label: "UMID",
    hint: "12-digit CRN",
    placeholder: "0000-0000000-0",
    pattern: /^\d{12}$/,
  },
  {
    value: "SSS",
    label: "SSS ID",
    hint: "10-digit SS number",
    placeholder: "00-0000000-0",
    pattern: /^\d{10}$/,
  },
  {
    value: "PHILID",
    label: "PhilSys / National ID",
    hint: "16-digit PhilSys Card Number (PCN)",
    placeholder: "0000-0000-0000-0000",
    pattern: /^\d{16}$/,
  },
  {
    value: "DRIVERS_LICENSE",
    label: "Driver's License (LTO)",
    hint: "11 characters, e.g. N01-23-456789",
    placeholder: "N01-23-456789",
    pattern: /^[A-Z]\d{2}\d{2}\d{6}$/,
  },
  {
    value: "TIN",
    label: "TIN ID (BIR)",
    hint: "9 or 12 digits",
    placeholder: "000-000-000-000",
    pattern: /^(\d{9}|\d{12})$/,
  },
  {
    value: "PRC",
    label: "PRC ID",
    hint: "6 to 8 digit license number",
    placeholder: "0000000",
    pattern: /^\d{6,8}$/,
  },
];

const LEGACY_PASSPORT: IdRule = {
  value: "PASSPORT",
  label: "Passport",
  hint: "8 to 9 characters",
  placeholder: "P1234567A",
  pattern: /^[A-Z0-9]{8,9}$/,
};

export const ID_TYPE_VALUES = [
  "PHILID",
  "UMID",
  "DRIVERS_LICENSE",
  "SSS",
  "TIN",
  "PRC",
  "PASSPORT",
] as const satisfies readonly IdTypeValue[];

/** Returns the canonical ID number (no spaces/hyphens, upper-case) or null if malformed. */
export function normalizeIdNumber(
  type: IdTypeValue,
  raw: string
): string | null {
  const rule =
    type === "PASSPORT"
      ? LEGACY_PASSPORT
      : ID_RULES.find((r) => r.value === type);
  if (!rule) return null;
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  return rule.pattern.test(cleaned) ? cleaned : null;
}

/** Ways a borrower can pay back. Each one points at an admin-managed receiving account. */
export const COLLECTION_METHODS = [
  { value: "GCASH_QR", label: "GCash QR", accountKind: "GCASH" },
  { value: "MAYA_QR", label: "Maya QR", accountKind: "MAYA" },
  { value: "BANK_TRANSFER", label: "Bank transfer", accountKind: "BANK" },
  { value: "CHEQUE", label: "Cheque", accountKind: "BANK" },
] as const;

export type CollectionMethodValue =
  (typeof COLLECTION_METHODS)[number]["value"];

/** Smallest single payment (or the whole balance, if that is less). */
export const MIN_PAYMENT_AMOUNT = 100;

export type PaymentMethodValue = "GCASH" | "MAYA" | "INSTAPAY" | "PESONET";

export const PAYMENT_METHODS: {
  value: PaymentMethodValue;
  label: string;
  kind: "EWALLET" | "BANK";
  accountHint: string;
  speed: string;
}[] = [
  {
    value: "GCASH",
    label: "GCash",
    kind: "EWALLET",
    accountHint: "GCash-registered mobile number (09XXXXXXXXX)",
    speed: "Instant",
  },
  {
    value: "MAYA",
    label: "Maya",
    kind: "EWALLET",
    accountHint: "Maya-registered mobile number (09XXXXXXXXX)",
    speed: "Instant",
  },
  {
    value: "INSTAPAY",
    label: "InstaPay (bank transfer)",
    kind: "BANK",
    accountHint: "Bank account number (8–20 digits)",
    speed: "Real-time, usually within seconds",
  },
  {
    value: "PESONET",
    label: "PESONet (bank transfer)",
    kind: "BANK",
    accountHint: "Bank account number (8–20 digits)",
    speed: "Batch, usually the same or next banking day",
  },
];

export const BANKS: { code: string; name: string }[] = [
  { code: "BDO", name: "BDO Unibank" },
  { code: "BPI", name: "Bank of the Philippine Islands (BPI)" },
  { code: "MBTC", name: "Metrobank" },
  { code: "UBP", name: "UnionBank of the Philippines" },
  { code: "LBP", name: "Land Bank of the Philippines" },
  { code: "PNB", name: "Philippine National Bank" },
  { code: "SECB", name: "Security Bank" },
  { code: "RCBC", name: "RCBC" },
  { code: "CHIB", name: "China Bank" },
  { code: "EWB", name: "EastWest Bank" },
];

export const DOCUMENT_REQUIREMENTS = [
  "Age 18 to 100, with a Philippine mobile number (+63 / 09XXXXXXXXX) that can receive an OTP",
  "One valid government-issued ID: UMID, SSS, PhilSys/National ID, Driver's License, TIN or PRC",
  "A clear photo of the front of that ID (JPEG or PNG, up to 5 MB)",
  "A clear selfie of you holding the same ID (JPEG or PNG, up to 5 MB)",
  "Your complete current residential address",
  "A GCash, Maya or bank account in your own name to receive the loan",
];

export type DisbursementInput = {
  method: PaymentMethodValue;
  account: string;
  bankCode?: string | null;
};

/** Returns the normalized account (or an error message). Used for payout and repayment checks. */
export function validateDisbursement(
  input: DisbursementInput
):
  | { ok: true; account: string; bankCode: string | null }
  | { ok: false; message: string } {
  const method = PAYMENT_METHODS.find((m) => m.value === input.method);
  if (!method) return { ok: false, message: "Unsupported payout method" };

  if (method.kind === "EWALLET") {
    const mobile = normalizePhMobile(input.account);
    if (!mobile)
      return {
        ok: false,
        message: `Enter a valid ${method.label} mobile number, e.g. 09171234567`,
      };
    return { ok: true, account: mobile, bankCode: null };
  }

  const bank = BANKS.find((b) => b.code === input.bankCode);
  if (!bank) return { ok: false, message: "Select a supported bank" };
  const digits = input.account.replace(/[\s-]/g, "");
  if (!/^\d{8,20}$/.test(digits))
    return { ok: false, message: "Bank account number must be 8 to 20 digits" };
  return { ok: true, account: digits, bankCode: bank.code };
}

/** Highest monthly nominal rate the app accepts anywhere (pricing, overrides, quotes). */
export const MAX_MONTHLY_RATE_PERCENT = 25;

/** SEC MC 14 s.2025 covered loans: unsecured, <= PHP 10,000 and <= 4 months. */
export const isSecCovered = (principal: number, termMonths: number) =>
  principal <= REGULATORY_REFERENCE.coveredPrincipalMax &&
  termMonths <= REGULATORY_REFERENCE.coveredTermMonthsMax;
