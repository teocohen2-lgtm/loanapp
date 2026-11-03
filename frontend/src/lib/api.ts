export type Role = "BORROWER" | "REVIEWER" | "ADMIN";
export type KycStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

export type User = {
  id: string;
  mobileNumber: string;
  email: string | null;
  role: Role;
  isMobileVerified: boolean;
  kycStatus: KycStatus;
};

export type Session = {
  token: string;
  user: User;
};

export type PaymentMethod = "GCASH" | "MAYA" | "INSTAPAY" | "PESONET";

export type Meta = {
  currency: string;
  currencySymbol: string;
  limits: {
    minPrincipal: number;
    maxPrincipal: number;
    minTermMonths: number;
    maxTermMonths: number;
  };
  regulation: {
    circular: string;
    coveredPrincipalMax: number;
    coveredTermMonthsMax: number;
    nominalCapPercentPerMonth: number;
    effectiveCapPercentPerMonth: number;
    penaltyCapPercentPerMonth: number;
    totalCostCapPercentOfPrincipal: number;
  };
  idTypes: {
    value: string;
    label: string;
    hint: string;
    placeholder: string;
  }[];
  paymentMethods: {
    value: PaymentMethod;
    label: string;
    kind: "EWALLET" | "BANK";
    accountHint: string;
    speed: string;
  }[];
  banks: { code: string; name: string }[];
  documentRequirements: string[];
};

export type ScheduleRow = {
  installment: number;
  dueDate: string;
  openingPrincipal: string;
  principal: string;
  interest: string;
  payment: string;
  closingPrincipal: string;
};

export type Quote = {
  principal: string;
  termMonths: number;
  startDate: string;
  maturityDate: string;
  monthlyRatePercent: string;
  processingFee: string;
  dstPayer: string;
  borrowerDst: string;
  deductions: string;
  netProceeds: string;
  regularInstallment: string;
  finalInstallment: string;
  totalInterest: string;
  totalRepayment: string;
  totalBorrowerCost: string;
  monthlyEirPercent: string;
  annualEffectiveRatePercent: string;
  applicableSmallLoanScope: boolean;
  applicationEligible: boolean;
  ineligibleReasons: string[];
  disclosure: string;
  schedule: ScheduleRow[];
};

export type LoanStatus =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED"
  | "REPAID";

export type Repayment = {
  id: string;
  installmentNo: number;
  amount: string;
  method: PaymentMethod;
  reference: string;
  createdAt: string;
};

export type Application = {
  id: string;
  status: LoanStatus;
  principal: string;
  termMonths: number;
  monthlyRatePercent: string;
  rateSource: string;
  quote: Quote;
  createdAt: string;
  disbursementMethod: PaymentMethod;
  disbursementAccount: string;
  disbursementBankCode: string | null;
  disbursementRef: string | null;
  disbursedAt: string | null;
  rejectionReason: string | null;
  repayments?: { installmentNo: number }[] | Repayment[];
  user?: { mobileNumber: string; kycProfile: { fullName: string } | null };
};

export type Policy = {
  id: string;
  version: number;
  monthlyRatePercent: string;
  processingFee: string;
  dstPayer: "LENDER" | "BORROWER";
  reason: string;
  createdAt: string;
};

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ----------------------------------------------------------- session storage

const SESSION_KEY = "pesoloan.session";

/** sessionStorage keeps you signed in across a refresh but not after the tab closes. */
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

let onUnauthorized: (() => void) | null = null;

/** App registers this so an expired token signs the user out everywhere. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function errorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (err instanceof ApiError) {
    const details = err.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { field?: string; message?: string } | string;
      if (typeof first === "string")
        return `${err.message}: ${details.join("; ")}`;
      if (first?.message)
        return first.field ? `${first.field}: ${first.message}` : first.message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

// ------------------------------------------------------------------- request

async function send(
  path: string,
  options: RequestInit,
  token?: string
): Promise<Response> {
  const headers = new Headers(options.headers);

  // FormData uploads must set their own multipart boundary.
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    return await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "Cannot connect to the server. Check your connection and try again.",
      0
    );
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await send(path, options, token);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(
      data?.error?.message ?? "The request could not be completed.",
      response.status,
      data?.error?.code,
      data?.error?.details
    );
  }

  if (data === null) {
    throw new ApiError(
      "The server returned an unexpected response.",
      response.status
    );
  }
  return data as T;
}

/** Fetches a protected image with the bearer token and returns a temporary object URL. */
export async function fetchImageUrl(
  path: string,
  token: string
): Promise<string> {
  const response = await send(path, {}, token);
  if (!response.ok)
    throw new ApiError("Could not load the image.", response.status);
  return URL.createObjectURL(await response.blob());
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

// ---------------------------------------------------------------------- auth

export const getMeta = () => apiRequest<Meta>("/api/meta");

export const login = (mobileNumber: string, password: string) =>
  apiRequest<Session>("/api/auth/login", json({ mobileNumber, password }));

export const register = (body: {
  mobileNumber: string;
  password: string;
  email?: string;
}) =>
  apiRequest<{ message: string; mobileNumber: string; devOtp?: string }>(
    "/api/auth/register",
    json(body)
  );

export const verifyOtp = (mobileNumber: string, code: string) =>
  apiRequest<Session>("/api/auth/verify-otp", json({ mobileNumber, code }));

export const resendOtp = (mobileNumber: string) =>
  apiRequest<{ message: string; devOtp?: string }>(
    "/api/auth/resend-otp",
    json({ mobileNumber })
  );

export const forgotPassword = (mobileNumber: string) =>
  apiRequest<{ message: string; devOtp?: string }>(
    "/api/auth/forgot-password",
    json({ mobileNumber })
  );

export const resetPassword = (
  mobileNumber: string,
  code: string,
  newPassword: string
) =>
  apiRequest<{ message: string }>(
    "/api/auth/reset-password",
    json({ mobileNumber, code, newPassword })
  );

export const getMe = (token: string) =>
  apiRequest<{ user: User }>("/api/auth/me", {}, token);

// ----------------------------------------------------------------------- KYC

export type MyKyc = {
  status: KycStatus;
  idType?: string;
  idNumberLast4?: string;
  rejectionReason?: string | null;
};

export const getMyKyc = (token: string) =>
  apiRequest<{ kyc: MyKyc }>("/api/kyc/me", {}, token);

export const submitKyc = (token: string, form: FormData) =>
  apiRequest<{ message: string; status: KycStatus }>(
    "/api/kyc/submit",
    { method: "POST", body: form },
    token
  );

export type KycReviewItem = {
  userId: string;
  fullName: string;
  idType: string;
  createdAt: string;
};

export type KycReviewDetail = {
  userId: string;
  fullName: string;
  birthDate: string;
  address: string;
  idType: string;
  idNumber: string;
  idNumberLast4: string;
  status: KycStatus;
  idImageUrl: string;
  selfieUrl: string;
};

export const listPendingKyc = (token: string) =>
  apiRequest<{ items: KycReviewItem[] }>("/api/kyc/admin/pending", {}, token);

export const getKycForReview = (token: string, userId: string) =>
  apiRequest<{ kyc: KycReviewDetail }>(`/api/kyc/admin/${userId}`, {}, token);

export const reviewKyc = (
  token: string,
  userId: string,
  body: { decision: "APPROVED" | "REJECTED"; reason?: string }
) =>
  apiRequest<{ message: string }>(
    `/api/kyc/admin/${userId}/review`,
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );

// --------------------------------------------------------------------- loans

export type Pricing = {
  policyVersion: number;
  rateSource: string;
  monthlyRatePercent: string;
  processingFee: string;
  dstPayer: string;
};

export const getPricing = (token: string) =>
  apiRequest<Pricing>("/api/loans/pricing", {}, token);

export const calculate = (
  token: string,
  body: { principal: string; termMonths: number; startDate: string }
) => apiRequest<Quote>("/api/loans/calculator", json(body), token);

export type ApplyBody = {
  principal: string;
  termMonths: number;
  startDate: string;
  requestKey: string;
  disbursementMethod: PaymentMethod;
  disbursementAccount: string;
  disbursementBankCode?: string;
};

export const applyForLoan = (token: string, body: ApplyBody) =>
  apiRequest<{ application: Application; replayed: boolean }>(
    "/api/loans/applications",
    json(body),
    token
  );

export const listApplications = (token: string) =>
  apiRequest<{ items: Application[] }>("/api/loans/applications", {}, token);

export const getApplication = (token: string, id: string) =>
  apiRequest<{ application: Application & { repayments: Repayment[] } }>(
    `/api/loans/applications/${id}`,
    {},
    token
  );

export const payInstallment = (
  token: string,
  id: string,
  method: PaymentMethod
) =>
  apiRequest<{ repayment: Repayment; status: LoanStatus }>(
    `/api/loans/applications/${id}/payments`,
    json({ method }),
    token
  );

// --------------------------------------------------------------------- admin

export const adminListApplications = (token: string, status?: LoanStatus) =>
  apiRequest<{ items: Application[] }>(
    `/api/loans/admin/applications${status ? `?status=${status}` : ""}`,
    {},
    token
  );

export const adminReviewApplication = (
  token: string,
  id: string,
  body: { decision: "APPROVED" | "REJECTED"; reason?: string }
) =>
  apiRequest<{ application: Application }>(
    `/api/loans/admin/applications/${id}/review`,
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );

export const adminDisburse = (token: string, id: string) =>
  apiRequest<{ application: Application; eta: string; amount: string }>(
    `/api/loans/admin/applications/${id}/disburse`,
    { method: "POST" },
    token
  );

export const adminListPolicies = (token: string) =>
  apiRequest<{ items: Policy[] }>("/api/loans/admin/policies", {}, token);

export const adminCreatePolicy = (
  token: string,
  body: {
    monthlyRatePercent: string;
    processingFee: string;
    dstPayer: "LENDER" | "BORROWER";
    reason: string;
  }
) =>
  apiRequest<{ policy: Policy }>(
    "/api/loans/admin/policies",
    json(body),
    token
  );

export type AdminBorrower = {
  id: string;
  mobileNumber: string;
  kycStatus: KycStatus;
  kycProfile: { fullName: string } | null;
  rateOverride: { monthlyRatePercent: string } | null;
};

export const adminListBorrowers = (token: string) =>
  apiRequest<{ items: AdminBorrower[] }>(
    "/api/loans/admin/borrowers",
    {},
    token
  );

export const adminSetBorrowerRate = (
  token: string,
  userId: string,
  body: { monthlyRatePercent: string | null; reason: string }
) =>
  apiRequest<{ userId: string }>(
    `/api/loans/admin/borrowers/${userId}/rate`,
    { method: "PUT", body: JSON.stringify(body) },
    token
  );

// ------------------------------------------------------------------- reports

export type ReportType =
  | "applications"
  | "repayments"
  | "borrowers"
  | "pricing";

/** Downloads an admin CSV report. The bearer token rules out a plain link, so fetch a blob. */
export async function downloadReport(
  token: string,
  type: ReportType,
  filters: { from?: string; to?: string; status?: string } = {}
): Promise<{ rows: number; truncated: boolean }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  const query = params.toString();

  const response = await send(
    `/api/admin/reports/${type}${query ? `?${query}` : ""}`,
    {},
    token
  );
  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) onUnauthorized();
    const data = await response.json().catch(() => null);
    throw new ApiError(
      data?.error?.message ?? "The report could not be downloaded.",
      response.status,
      data?.error?.code,
      data?.error?.details
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    /filename="([^"]+)"/.exec(disposition)?.[1] ?? `pesoloan-${type}.csv`;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    rows: Number(response.headers.get("X-Report-Rows") ?? 0),
    truncated: response.headers.get("X-Report-Truncated") === "true",
  };
}
