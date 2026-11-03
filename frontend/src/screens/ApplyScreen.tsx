import { useEffect, useRef, useState } from "react";
import {
  applyForLoan,
  calculate,
  errorMessage,
  getMeta,
  getPricing,
  type Application,
  type PaymentMethod,
  type Quote,
  type User,
} from "../lib/api";
// import { formatDate, formatPeso, isPhMobile, percent, todayInManila } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
// import { Alert, Button, Card, Field, Loading, Stat } from "../components/ui";
import type { View } from "../lib/view";
import {
  formatDate,
  formatPeso,
  formatPesoWhole,
  isPhMobile,
  percent,
  todayInManila,
} from "../lib/format";
import {
  Alert,
  Button,
  Card,
  Empty,
  Field,
  Icon,
  Loading,
  PageHeader,
  Resibo,
  ResiboRow,
} from "../components/ui";

export default function ApplyScreen({
  token,
  user,
  go,
}: {
  token: string;
  user: User;
  go: (view: View, loanId?: string) => void;
}) {
  const meta = useResource(() => getMeta(), []);
  const pricing = useResource(() => getPricing(token), [token]);

  const [principal, setPrincipal] = useState(5000);
  const [term, setTerm] = useState(3);
  const [method, setMethod] = useState<PaymentMethod>("GCASH");
  const [account, setAccount] = useState("");
  const [bankCode, setBankCode] = useState("BDO");
  const [agree, setAgree] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Application | null>(null);

  // Same details reuse one requestKey (safe retries); changed details get a new key.
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const limits = meta.data?.limits;
  const principalOk =
    !!limits &&
    Number.isInteger(principal) &&
    principal >= limits.minPrincipal &&
    principal <= limits.maxPrincipal;

  // Live quote, debounced so typing an amount does not spam the API.
  useEffect(() => {
    if (!principalOk) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const q = await calculate(token, {
          principal: String(principal),
          termMonths: term,
          startDate: todayInManila(),
        });
        if (!cancelled) {
          setQuote(q);
          setQuoteError("");
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(errorMessage(err));
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, principal, term, principalOk]);

  // if (user.kycStatus !== "APPROVED")
  //   return (
  //     <div className="space-y-4">
  //       <h1 className="text-3xl font-bold">Apply for a loan</h1>
  //       <Alert kind="warning">
  //         You need an approved identity verification before applying.{" "}
  //         <button onClick={() => go("kyc")} className="font-semibold underline">
  //           Go to verification
  //         </button>
  //       </Alert>
  //     </div>
  //   );

  if (user.kycStatus !== "APPROVED")
    return (
      <div className="space-y-6">
        <PageHeader title="Apply for a loan" />
        <Empty
          icon="shield"
          title="Verify your ID first"
          action={<Button onClick={() => go("kyc")}>Verify ID</Button>}
        >
          We check your ID once. After it is approved you can see your quote and
          apply.
        </Empty>
      </div>
    );

  if (meta.loading || pricing.loading) return <Loading />;
  if (meta.error || !meta.data)
    return <Alert>{meta.error || "Could not load reference data."}</Alert>;
  if (pricing.error || !pricing.data)
    return <Alert>{pricing.error || "Pricing is not available yet."}</Alert>;

  const m = meta.data;
  const selected = m.paymentMethods.find((p) => p.value === method)!;
  const isBank = selected.kind === "BANK";
  const accountOk = isBank
    ? /^\d{8,20}$/.test(account.replace(/[\s-]/g, ""))
    : isPhMobile(account);
  const canApply =
    !!quote?.applicationEligible && principalOk && accountOk && agree && !busy;

  async function submit() {
    if (!canApply) return;
    const fingerprint = JSON.stringify([
      principal,
      term,
      method,
      account.trim(),
      isBank ? bankCode : null,
    ]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };

    setBusy(true);
    setError("");
    try {
      const result = await applyForLoan(token, {
        principal: String(principal),
        termMonths: term,
        startDate: todayInManila(),
        requestKey: attempt.current.key,
        disbursementMethod: method,
        disbursementAccount: account.trim(),
        ...(isBank ? { disbursementBankCode: bankCode } : {}),
      });
      setCreated(result.application);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-100 text-brand-700">
            <Icon name="check" className="size-8" />
          </span>
          <h1 className="mt-5 text-3xl font-bold">Application sent</h1>
          <p className="mt-2 text-slate-500">
            {formatPeso(created.principal)} over {created.termMonths} month
            {created.termMonths === 1 ? "" : "s"}. We will review it next. After
            it is approved and released, the money goes to your {selected.label}{" "}
            account.
          </p>
        </div>
        <Alert kind="info">This is a demo, so no real money moves.</Alert>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => go("loan", created.id)}>
            View application
          </Button>
          <Button size="lg" variant="secondary" onClick={() => go("home")}>
            Back to home
          </Button>
        </div>
      </div>
    );

  const quickAmounts = [1000, 3000, 5000, 10000, 20000, 50000].filter(
    (n) => n >= m.limits.minPrincipal && n <= m.limits.maxPrincipal
  );
  const terms = Array.from(
    { length: m.limits.maxTermMonths - m.limits.minTermMonths + 1 },
    (_, i) => i + m.limits.minTermMonths
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apply for a loan"
        subtitle={`Borrow ${formatPesoWhole(
          m.limits.minPrincipal
        )} to ${formatPesoWhole(m.limits.maxPrincipal)} for ${
          m.limits.minTermMonths
        } to ${
          m.limits.maxTermMonths
        } months. Your quote updates as you choose.`}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="1. How much, and for how long?">
            <div className="space-y-6">
              <Field label="Loan amount" htmlFor="principal">
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl font-bold text-slate-400">
                    ₱
                  </span>
                  <input
                    id="principal"
                    type="number"
                    inputMode="numeric"
                    step={100}
                    min={m.limits.minPrincipal}
                    max={m.limits.maxPrincipal}
                    value={Number.isNaN(principal) ? "" : principal}
                    onChange={(e) =>
                      setPrincipal(
                        e.target.value === "" ? NaN : Number(e.target.value)
                      )
                    }
                    className={`${inputCls} money pl-10 font-display text-3xl! font-bold`}
                  />
                </div>
                <input
                  type="range"
                  aria-label="Loan amount"
                  step={500}
                  min={m.limits.minPrincipal}
                  max={m.limits.maxPrincipal}
                  value={principalOk ? principal : m.limits.minPrincipal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="mt-4 h-2 w-full accent-brand-800"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickAmounts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPrincipal(n)}
                      aria-pressed={principal === n}
                      className={`money rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                        principal === n
                          ? "border-brand-900 bg-brand-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {formatPesoWhole(n)}
                    </button>
                  ))}
                </div>
              </Field>
              {!principalOk && (
                <Alert kind="warning">
                  Enter a whole-peso amount between{" "}
                  {formatPesoWhole(m.limits.minPrincipal)} and{" "}
                  {formatPesoWhole(m.limits.maxPrincipal)}.
                </Alert>
              )}

              <Field label="Pay it back over">
                <div className="grid grid-cols-6 gap-2">
                  {terms.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTerm(n)}
                      aria-pressed={term === n}
                      className={`min-h-11 rounded-xl border text-sm font-semibold transition ${
                        term === n
                          ? "border-brand-900 bg-brand-900 text-white"
                          : "border-slate-300 bg-white hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Number of months</p>
              </Field>

              <p className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                Your rate is{" "}
                <strong className="text-slate-900">
                  {percent(pricing.data.monthlyRatePercent)} a month
                </strong>{" "}
                on what you still owe
                {pricing.data.rateSource === "BORROWER_OVERRIDE"
                  ? " (your custom rate)"
                  : ""}
                . A{" "}
                <strong className="text-slate-900">
                  {formatPeso(pricing.data.processingFee)}
                </strong>{" "}
                processing fee is taken from the money you receive.
              </p>
            </div>
          </Card>

          <Card title="2. Where should we send the money?">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {m.paymentMethods.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setMethod(p.value);
                      setAccount("");
                    }}
                    aria-pressed={method === p.value}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                      method === p.value
                        ? "border-brand-700 bg-brand-50 ring-2 ring-brand-200"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span className="mt-0.5 text-brand-700">
                      <Icon
                        name={p.kind === "BANK" ? "bank" : "wallet"}
                        className="size-6"
                      />
                    </span>
                    <span>
                      <span className="block font-semibold">{p.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {p.speed}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {isBank && (
                <Field label="Bank" htmlFor="bank">
                  <select
                    id="bank"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className={inputCls}
                  >
                    {m.banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                label={
                  isBank ? "Account number" : `${selected.label} mobile number`
                }
                htmlFor="account"
                hint={selected.accountHint}
              >
                <input
                  id="account"
                  inputMode={isBank ? "numeric" : "tel"}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder={isBank ? "Account number" : "09XXXXXXXXX"}
                  className={inputCls}
                />
              </Field>
              {account && !accountOk && (
                <Alert kind="warning">
                  {isBank
                    ? "Account numbers are 8 to 20 digits."
                    : "Enter a valid Philippine mobile number, e.g. 09171234567."}
                </Alert>
              )}
              <p className="text-xs text-slate-500">
                The account must be in your own name. Payouts here are
                simulated.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
          {quoteError ? (
            <Alert>{quoteError}</Alert>
          ) : !quote ? (
            <Loading label="Calculating" />
          ) : (
            <>
              <Resibo
                title="Your quote"
                foot={
                  <>
                    <p>
                      Rate {percent(quote.monthlyRatePercent)} a month · about{" "}
                      {percent(quote.monthlyEirPercent)} a month including fees
                      · last payment due {formatDate(quote.maturityDate)}.
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold text-brand-800">
                        About rate limits
                      </summary>
                      <p className="mt-1">
                        Loans of {formatPeso(m.regulation.coveredPrincipalMax)}{" "}
                        or less for up to {m.regulation.coveredTermMonthsMax}{" "}
                        months are capped by the SEC at{" "}
                        {m.regulation.nominalCapPercentPerMonth}% nominal and{" "}
                        {m.regulation.effectiveCapPercentPerMonth}% effective
                        interest a month ({m.regulation.circular}). Other loans
                        can be priced up to 25% a month. Late penalties are not
                        charged in this demo.
                      </p>
                    </details>
                  </>
                }
              >
                <ResiboRow
                  label="Loan amount"
                  value={formatPeso(quote.principal)}
                />
                <ResiboRow
                  label="Fees taken out"
                  value={`−${formatPeso(quote.deductions)}`}
                  muted
                />
                <ResiboRow
                  label="You receive"
                  value={formatPeso(quote.netProceeds)}
                  strong
                  divider
                />
                <ResiboRow
                  label={term === 1 ? "You pay once" : "Monthly payment"}
                  value={formatPeso(quote.regularInstallment)}
                  sub={
                    term === 1
                      ? undefined
                      : `for ${term} months${
                          quote.finalInstallment !== quote.regularInstallment
                            ? `, last one ${formatPeso(quote.finalInstallment)}`
                            : ""
                        }`
                  }
                />
                <ResiboRow
                  label="Interest in total"
                  value={formatPeso(quote.totalInterest)}
                  muted
                />
                <ResiboRow
                  label="Total you pay back"
                  value={formatPeso(quote.totalRepayment)}
                  strong
                  divider
                />
              </Resibo>

              {!quote.applicationEligible && (
                <Alert kind="warning">
                  This loan can't be applied for:{" "}
                  {quote.ineligibleReasons.join("; ")}.
                </Alert>
              )}
              {Number(quote.monthlyRatePercent) > 6 && (
                <Alert kind="warning">
                  High-cost loan: {Number(quote.monthlyRatePercent)}% a month is
                  about{" "}
                  {Number(quote.annualEffectiveRatePercent).toLocaleString(
                    "en-PH",
                    { maximumFractionDigits: 0 }
                  )}
                  % a year once compounded. You would pay back{" "}
                  {formatPeso(quote.totalRepayment)}.
                </Alert>
              )}

              <button
                type="button"
                onClick={() => setShowSchedule((s) => !s)}
                aria-expanded={showSchedule}
                className="text-sm font-semibold text-brand-800 hover:underline"
              >
                {showSchedule ? "Hide" : "Show"} month-by-month schedule
              </button>
              {showSchedule && (
                <Card>
                  <ScheduleTable rows={quote.schedule} />
                </Card>
              )}
            </>
          )}

          <Card>
            <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 size-5 accent-brand-800"
              />
              <span>
                I checked the quote and agree to pay back the total on the due
                dates in the schedule.
              </span>
            </label>
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
            <Button
              size="lg"
              className="mt-4 w-full"
              disabled={!canApply}
              onClick={() => void submit()}
            >
              {busy ? "Sending…" : "Send application"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ScheduleTable({
  rows,
  paid = 0,
}: {
  rows: Quote["schedule"];
  paid?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Due</th>
            <th className="py-2 pr-3 text-right">Principal</th>
            <th className="py-2 pr-3 text-right">Interest</th>
            <th className="py-2 pr-3 text-right">Payment</th>
            <th className="py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r.installment}
              className={r.installment <= paid ? "text-slate-400" : ""}
            >
              <td className="py-2 pr-3">{r.installment}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatDate(r.dueDate)}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatPeso(r.principal)}
              </td>
              <td className="py-2 pr-3 text-right">{formatPeso(r.interest)}</td>
              <td className="py-2 pr-3 text-right font-semibold">
                {formatPeso(r.payment)}
                {r.installment <= paid ? " ✓" : ""}
              </td>
              <td className="py-2 text-right">
                {formatPeso(r.closingPrincipal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
