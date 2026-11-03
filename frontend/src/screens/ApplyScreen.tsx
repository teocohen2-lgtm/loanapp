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
import { formatDate, formatPeso, isPhMobile, percent, todayInManila } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Field, Loading, Stat } from "../components/ui";
import type { View } from "../lib/view";

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
  const principalOk = !!limits && Number.isInteger(principal) && principal >= limits.minPrincipal && principal <= limits.maxPrincipal;

  // Live quote, debounced so typing an amount does not spam the API.
  useEffect(() => {
    if (!principalOk) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const q = await calculate(token, { principal: String(principal), termMonths: term, startDate: todayInManila() });
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

  if (user.kycStatus !== "APPROVED")
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Apply for a loan</h1>
        <Alert kind="warning">
          You need an approved identity verification before applying.{" "}
          <button onClick={() => go("kyc")} className="font-semibold underline">
            Go to verification
          </button>
        </Alert>
      </div>
    );

  if (meta.loading || pricing.loading) return <Loading />;
  if (meta.error || !meta.data) return <Alert>{meta.error || "Could not load reference data."}</Alert>;
  if (pricing.error || !pricing.data) return <Alert>{pricing.error || "Pricing is not available yet."}</Alert>;

  const m = meta.data;
  const selected = m.paymentMethods.find((p) => p.value === method)!;
  const isBank = selected.kind === "BANK";
  const accountOk = isBank ? /^\d{8,20}$/.test(account.replace(/[\s-]/g, "")) : isPhMobile(account);
  const canApply = !!quote?.applicationEligible && principalOk && accountOk && agree && !busy;

  async function submit() {
    if (!canApply) return;
    const fingerprint = JSON.stringify([principal, term, method, account.trim(), isBank ? bankCode : null]);
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
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Application submitted</h1>
        <Card>
          <p className="text-lg font-semibold">
            {formatPeso(created.principal)} over {created.termMonths} month{created.termMonths === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Your application is waiting for review. Once approved and released, the funds go to your {selected.label}{" "}
            account. This is a demo: no real money moves.
          </p>
          <div className="mt-5 flex gap-3">
            <Button onClick={() => go("loan", created.id)}>View application</Button>
            <Button variant="secondary" onClick={() => go("home")}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Apply for a loan</h1>
        <p className="mt-2 text-slate-500">
          Borrow {formatPeso(m.limits.minPrincipal)} to {formatPeso(m.limits.maxPrincipal)} over {m.limits.minTermMonths} to{" "}
          {m.limits.maxTermMonths} months.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="1. How much and for how long?">
            <div className="space-y-5">
              <Field label="Loan amount (₱)" htmlFor="principal">
                <input id="principal" type="number" inputMode="numeric" step={100} min={m.limits.minPrincipal}
                  max={m.limits.maxPrincipal} value={Number.isNaN(principal) ? "" : principal}
                  onChange={(e) => setPrincipal(e.target.value === "" ? NaN : Number(e.target.value))} className={inputCls} />
                <input type="range" aria-label="Loan amount" step={500} min={m.limits.minPrincipal} max={m.limits.maxPrincipal}
                  value={principalOk ? principal : m.limits.minPrincipal}
                  onChange={(e) => setPrincipal(Number(e.target.value))} className="mt-3 w-full accent-emerald-800" />
              </Field>
              {!principalOk && (
                <Alert kind="warning">
                  Enter a whole-peso amount between {formatPeso(m.limits.minPrincipal)} and {formatPeso(m.limits.maxPrincipal)}.
                </Alert>
              )}

              <Field label="Term (months)">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: m.limits.maxTermMonths - m.limits.minTermMonths + 1 }, (_, i) => i + m.limits.minTermMonths).map((n) => (
                    <button key={n} type="button" onClick={() => setTerm(n)} aria-pressed={term === n}
                      className={`size-11 rounded-xl border text-sm font-semibold ${term === n ? "border-emerald-900 bg-emerald-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>

              <p className="text-sm text-slate-500">
                Your rate: <strong>{percent(pricing.data.monthlyRatePercent)} per month</strong> on the remaining balance
                {pricing.data.rateSource === "BORROWER_OVERRIDE" ? " (custom rate)" : ""}, plus a{" "}
                <strong>{formatPeso(pricing.data.processingFee)}</strong> processing fee deducted from the proceeds.
              </p>
            </div>
          </Card>

          <Card title="2. Where should we send the money?">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {m.paymentMethods.map((p) => (
                  <button key={p.value} type="button" onClick={() => { setMethod(p.value); setAccount(""); }}
                    aria-pressed={method === p.value}
                    className={`rounded-xl border p-4 text-left ${method === p.value ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-300 hover:bg-slate-50"}`}>
                    <span className="block font-semibold">{p.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{p.speed}</span>
                  </button>
                ))}
              </div>

              {isBank && (
                <Field label="Bank" htmlFor="bank">
                  <select id="bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={inputCls}>
                    {m.banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={isBank ? "Account number" : `${selected.label} mobile number`} htmlFor="account" hint={selected.accountHint}>
                <input id="account" inputMode={isBank ? "numeric" : "tel"} value={account} onChange={(e) => setAccount(e.target.value)}
                  placeholder={isBank ? "Account number" : "09XXXXXXXXX"} className={inputCls} />
              </Field>
              {account && !accountOk && (
                <Alert kind="warning">
                  {isBank ? "Account numbers are 8 to 20 digits." : "Enter a valid Philippine mobile number, e.g. 09171234567."}
                </Alert>
              )}
              <p className="text-xs text-slate-500">The account must be in your own name. Payouts here are simulated.</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Your loan summary">
            {quoteError ? (
              <Alert>{quoteError}</Alert>
            ) : !quote ? (
              <Loading label="Calculating…" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="You receive" value={formatPeso(quote.netProceeds)} sub={`after ${formatPeso(quote.deductions)} fees`} />
                  <Stat
                    label={term === 1 ? "Pay once" : "Monthly payment"}
                    value={formatPeso(quote.regularInstallment)}
                    sub={quote.finalInstallment !== quote.regularInstallment ? `last: ${formatPeso(quote.finalInstallment)}` : undefined}
                  />
                  <Stat label="Total interest" value={formatPeso(quote.totalInterest)} />
                  <Stat label="Total to repay" value={formatPeso(quote.totalRepayment)} />
                </div>
                <dl className="space-y-1.5 text-sm text-slate-600">
                  <Row label="Interest rate" value={`${percent(quote.monthlyRatePercent)} per month`} />
                  <Row label="Effective rate incl. fees" value={`${percent(quote.monthlyEirPercent)} per month`} />
                  <Row label="Final due date" value={formatDate(quote.maturityDate)} />
                </dl>

                <button type="button" onClick={() => setShowSchedule((s) => !s)} className="text-sm font-semibold text-emerald-800 hover:underline">
                  {showSchedule ? "Hide" : "Show"} repayment schedule
                </button>
                {showSchedule && <ScheduleTable rows={quote.schedule} />}

                {!quote.applicationEligible && (
                  <Alert kind="warning">This loan can't be applied for: {quote.ineligibleReasons.join("; ")}.</Alert>
                )}
                <p className="text-xs text-slate-500">
                  Loans of {formatPeso(m.regulation.coveredPrincipalMax)} or less for up to {m.regulation.coveredTermMonthsMax} months are
                  covered by the SEC's caps ({m.regulation.nominalCapPercentPerMonth}% nominal and{" "}
                  {m.regulation.effectiveCapPercentPerMonth}% effective interest per month, {m.regulation.circular}). This app applies the
                  same checks to every loan. Late penalties are not charged in this demo.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-emerald-800" />
              <span>I have reviewed the amounts above and agree to repay the total shown on the due dates in the schedule.</span>
            </label>
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
            <Button className="mt-4 w-full" disabled={!canApply} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit application"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function ScheduleTable({ rows, paid = 0 }: { rows: Quote["schedule"]; paid?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
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
            <tr key={r.installment} className={r.installment <= paid ? "text-slate-400" : ""}>
              <td className="py-2 pr-3">{r.installment}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.dueDate)}</td>
              <td className="py-2 pr-3 text-right">{formatPeso(r.principal)}</td>
              <td className="py-2 pr-3 text-right">{formatPeso(r.interest)}</td>
              <td className="py-2 pr-3 text-right font-semibold">{formatPeso(r.payment)}{r.installment <= paid ? " ✓" : ""}</td>
              <td className="py-2 text-right">{formatPeso(r.closingPrincipal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
