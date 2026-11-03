import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/ApiError";
import {
  LOAN_LIMITS,
  MAX_MONTHLY_RATE_PERCENT,
  REGULATORY_REFERENCE,
} from "../../config/ph";

// Use decimal arithmetic instead of JavaScript floating-point money calculations.
const Decimal = Prisma.Decimal.clone({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});

const money = (value: Prisma.Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(2);

const formatMoney = (value: Prisma.Decimal.Value) =>
  new Decimal(value).toFixed(2);

export const ENGINE_VERSION = "demo-monthly-v3";

export type QuoteInput = {
  principal: string;
  termMonths: number;

  // Example: "1.00" means 1% per month.
  // A rate must be provided explicitly.
  monthlyRatePercent: string;

  startDate: string;
  processingFee: string;
  dstPayer: "LENDER" | "BORROWER";

  method: "DIMINISHING" | "FLAT_SIMULATION";
};

type ScheduleRow = {
  installment: number;
  dueDate: string;
  openingPrincipal: string;
  principal: string;
  interest: string;
  payment: string;
  closingPrincipal: string;
};

/**
 * Preserve the original payment day where possible.
 *
 * January 31 + 1 month = February 28/29.
 * January 31 + 2 months = March 31.
 */
export function monthlyDate(start: string, months: number): string {
  const date = new Date(`${start}T00:00:00.000Z`);

  const year = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;

  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(year, targetMonth, Math.min(date.getUTCDate(), lastDay))
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Calculate effective monthly interest from net proceeds
 * and the actual rounded monthly installments.
 *
 * This assumes equally spaced monthly periods.
 */
function periodicEir(
  netProceeds: Prisma.Decimal,
  installments: Prisma.Decimal[]
): Prisma.Decimal {
  const presentValue = (rate: Prisma.Decimal) =>
    installments.reduce(
      (total, installment, index) =>
        total.plus(installment.div(new Decimal(1).plus(rate).pow(index + 1))),
      new Decimal(0)
    );

  if (presentValue(new Decimal(0)).eq(netProceeds)) {
    return new Decimal(0);
  }

  let low = new Decimal(0);
  let high = new Decimal(1);

  // Find an upper bound before solving.
  for (
    let attempt = 0;
    presentValue(high).gt(netProceeds) && attempt < 32;
    attempt++
  ) {
    high = high.mul(2);
  }

  if (presentValue(high).gt(netProceeds)) {
    throw ApiError.badRequest("Cannot calculate effective interest rate");
  }

  // Bisection avoids unstable Newton-Raphson guesses.
  for (let attempt = 0; attempt < 160; attempt++) {
    const middle = low.plus(high).div(2);

    if (presentValue(middle).gt(netProceeds)) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low.plus(high).div(2);
}

export function calculateLoan(input: QuoteInput) {
  const principal = money(input.principal);
  const processingFee = money(input.processingFee);

  const ratePercent = new Decimal(input.monthlyRatePercent);

  const monthlyRate = ratePercent.div(100);
  const months = input.termMonths;

  // These are supported DEMO limits, not universal legal limits.
  if (
    !principal.isFinite() ||
    principal.lt(1000) ||
    principal.gt(500000) ||
    !processingFee.isFinite() ||
    processingFee.lt(0) ||
    !monthlyRate.isFinite() ||
    monthlyRate.lt(0) ||
    monthlyRate.gt(new Decimal(MAX_MONTHLY_RATE_PERCENT).div(100)) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 60
  ) {
    throw ApiError.badRequest(
      "Amount, rate, fee or term outside supported demo limits"
    );
  }

  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) &&
    Number.isFinite(Date.parse(input.startDate));

  if (
    !validDate ||
    new Date(input.startDate).toISOString().slice(0, 10) !== input.startDate ||
    input.startDate < "2025-07-01" ||
    input.startDate > "2100-01-01"
  ) {
    throw ApiError.badRequest(
      "Use a real startDate between 2025-07-01 and 2100-01-01"
    );
  }

  const maturityDate = monthlyDate(input.startDate, months);

  const termDays =
    (Date.parse(maturityDate) - Date.parse(input.startDate)) / 86_400_000;

  /*
   * Estimate for an ordinary taxable unsecured debt instrument.
   * Exemptions, mortgages and other instruments need separate rules.
   */
  const dst = money(
    principal.mul("0.0075").mul(Math.min(termDays, 365)).div(365)
  );

  const borrowerDst = input.dstPayer === "BORROWER" ? dst : new Decimal(0);

  const deductions = processingFee.plus(borrowerDst);
  const netProceeds = principal.minus(deductions);

  if (netProceeds.lte(0)) {
    throw ApiError.badRequest("Deductions must be less than principal");
  }

  /*
   * Diminishing-balance annuity:
   *
   * EMI = P × r / [1 − (1 + r)^(-n)]
   *
   * Zero-interest loans use P / n.
   */
  const unroundedEmi = monthlyRate.eq(0)
    ? principal.div(months)
    : principal
        .mul(monthlyRate)
        .div(
          new Decimal(1).minus(new Decimal(1).plus(monthlyRate).pow(-months))
        );

  const emi = money(unroundedEmi);

  let balance = principal;
  let totalInterest = new Decimal(0);

  const schedule: ScheduleRow[] = [];
  const installments: Prisma.Decimal[] = [];

  for (let installment = 1; installment <= months; installment++) {
    const openingPrincipal = balance;

    // Flat mode is only an educational comparison.
    const interestBase =
      input.method === "FLAT_SIMULATION" ? principal : openingPrincipal;

    const interest = money(interestBase.mul(monthlyRate));

    let principalDue: Prisma.Decimal;

    if (installment === months) {
      // Clear the exact remaining balance in the final installment.
      principalDue = balance;
    } else if (input.method === "FLAT_SIMULATION") {
      principalDue = money(principal.div(months));
    } else {
      principalDue = emi.minus(interest);
    }

    principalDue = Decimal.min(principalDue, balance);

    if (principalDue.lte(0)) {
      throw ApiError.badRequest("Schedule cannot amortize at this precision");
    }

    const payment = principalDue.plus(interest);

    balance = money(balance.minus(principalDue));
    totalInterest = totalInterest.plus(interest);

    installments.push(payment);

    schedule.push({
      installment,
      dueDate: monthlyDate(input.startDate, installment),
      openingPrincipal: formatMoney(openingPrincipal),
      principal: formatMoney(principalDue),
      interest: formatMoney(interest),
      payment: formatMoney(payment),
      closingPrincipal: formatMoney(balance),
    });
  }

  const monthlyEir = periodicEir(netProceeds, installments);

  const annualEffectiveRate = new Decimal(1).plus(monthlyEir).pow(12).minus(1);

  const totalRepayment = installments.reduce(
    (total, installment) => total.plus(installment),
    new Decimal(0)
  );

  const totalBorrowerCost = totalInterest.plus(deductions);

  const coveredSmallLoan =
    principal.lte(REGULATORY_REFERENCE.coveredPrincipalMax) &&
    months <= REGULATORY_REFERENCE.coveredTermMonthsMax;

  /*
   * SEC MC 14 s.2025 ceilings (6% nominal, 12% effective, 100% total cost)
   * apply only to covered loans: PHP 10,000 or less and up to 4 months.
   * All other loans may be priced up to MAX_MONTHLY_RATE_PERCENT (25%).
   * Compare using unrounded EIR, not its display value.
   */
  const checks = {
    nominalWithinDemoLimit: coveredSmallLoan
      ? ratePercent.lte(REGULATORY_REFERENCE.nominalCapPercentPerMonth)
      : ratePercent.lte(MAX_MONTHLY_RATE_PERCENT),

    effectiveWithinDemoLimit: coveredSmallLoan
      ? monthlyEir.lte(new Decimal("0.12").plus("0.000000000001"))
      : true,

    costWithinDemoLimit: coveredSmallLoan
      ? totalBorrowerCost.lte(principal)
      : true,
  };

  // Everything the borrower must satisfy to apply; shown in the UI when not eligible.
  const ineligibleReasons: string[] = [];
  if (input.method !== "DIMINISHING")
    ineligibleReasons.push(
      "Flat-rate simulations are for comparison only and cannot be applied for"
    );
  if (
    principal.lt(LOAN_LIMITS.minPrincipal) ||
    principal.gt(LOAN_LIMITS.maxPrincipal)
  )
    ineligibleReasons.push(
      `Loan amount must be between PHP ${LOAN_LIMITS.minPrincipal.toLocaleString(
        "en-PH"
      )} and PHP ${LOAN_LIMITS.maxPrincipal.toLocaleString("en-PH")}`
    );
  if (months < LOAN_LIMITS.minTermMonths || months > LOAN_LIMITS.maxTermMonths)
    ineligibleReasons.push(
      `Term must be ${LOAN_LIMITS.minTermMonths} to ${LOAN_LIMITS.maxTermMonths} months`
    );
  if (!checks.nominalWithinDemoLimit)
    ineligibleReasons.push(
      coveredSmallLoan
        ? "Loans of PHP 10,000 or less for up to 4 months are capped at 6% monthly (SEC MC 14 s.2025)"
        : `Monthly interest exceeds the ${MAX_MONTHLY_RATE_PERCENT}% maximum`
    );
  if (!checks.effectiveWithinDemoLimit)
    ineligibleReasons.push(
      "Effective interest rate (including fees) exceeds 12% per month for this small short loan"
    );
  if (!checks.costWithinDemoLimit)
    ineligibleReasons.push(
      "Total borrowing cost exceeds 100% of the amount borrowed for this small short loan"
    );

  return {
    demoOnly: true,
    engineVersion: ENGINE_VERSION,
    currency: "PHP",
    method: input.method,

    principal: formatMoney(principal),
    termMonths: months,
    startDate: input.startDate,
    maturityDate,
    termDays,

    monthlyRatePercent: ratePercent.toFixed(6),
    nominalAnnualRatePercent: ratePercent.mul(12).toFixed(6),

    processingFee: formatMoney(processingFee),
    dstEstimate: formatMoney(dst),
    dstPayer: input.dstPayer,
    borrowerDst: formatMoney(borrowerDst),

    deductions: formatMoney(deductions),
    netProceeds: formatMoney(netProceeds),

    regularInstallment: schedule[0].payment,
    finalInstallment: schedule[schedule.length - 1].payment,

    totalInterest: formatMoney(totalInterest),
    totalRepayment: formatMoney(totalRepayment),
    totalBorrowerCost: formatMoney(totalBorrowerCost),

    monthlyEirPercent: monthlyEir.mul(100).toFixed(8),

    annualEffectiveRatePercent: annualEffectiveRate.mul(100).toFixed(8),

    checks,
    applicableSmallLoanScope: coveredSmallLoan,

    applicationEligible: ineligibleReasons.length === 0,
    ineligibleReasons,

    taxAssumption:
      "Ordinary taxable unsecured debt instrument under section 179; " +
      "no exemption assumed. CPA review required.",

    disclosure:
      "DEMO ONLY. No funds released. Equal monthly periods; " +
      "interest rounded half-up to centavos each period; " +
      "final payment adjusted. Flat mode is a simulation " +
      "and cannot create applications. No late penalties " +
      "or compounding are charged in this increment.",

    schedule,
  };
}
