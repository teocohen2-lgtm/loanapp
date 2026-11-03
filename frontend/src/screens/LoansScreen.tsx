import { useState } from "react";
import {
  errorMessage,
  getApplication,
  getMeta,
  listApplications,
  payInstallment,
  type Application,
  type Meta,
  type PaymentMethod,
} from "../lib/api";
import { displayMobile, formatDate, formatPeso, percent } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Empty, Field, Loading, Stat, StatusBadge } from "../components/ui";
import { ScheduleTable } from "./ApplyScreen";
import type { View } from "../lib/view";

export function describePayout(a: Application, meta: Meta): string {
  const method = meta.paymentMethods.find((p) => p.value === a.disbursementMethod);
  const label = method?.label ?? a.disbursementMethod;
  if (method?.kind === "BANK") {
    const bank = meta.banks.find((b) => b.code === a.disbursementBankCode)?.name ?? a.disbursementBankCode;
    return `${label} · ${bank} · account ending ${a.disbursementAccount.slice(-4)}`;
  }
  return `${label} · ${displayMobile(a.disbursementAccount)}`;
}

export function LoansList({ token, go }: { token: string; go: (view: View, loanId?: string) => void }) {
  const loans = useResource(() => listApplications(token), [token]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">My loans</h1>
        <Button onClick={() => go("apply")}>New application</Button>
      </div>

      {loans.loading ? (
        <Loading />
      ) : loans.error ? (
        <Alert>{loans.error}</Alert>
      ) : (loans.data?.items ?? []).length === 0 ? (
        <Empty>You have no loan applications yet.</Empty>
      ) : (
        <div className="grid gap-4">
          {loans.data!.items.map((l) => (
            <button key={l.id} onClick={() => go("loan", l.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-emerald-600">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold">{formatPeso(l.principal)}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {l.termMonths} month{l.termMonths === 1 ? "" : "s"} · applied {formatDate(l.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={l.status} />
                  {(l.status === "DISBURSED" || l.status === "REPAID") && (
                    <p className="mt-2 text-xs text-slate-500">
                      {l.repayments?.length ?? 0} of {l.termMonths} paid
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoanDetail({ token, id, go }: { token: string; id: string; go: (view: View) => void }) {
  const meta = useResource(() => getMeta(), []);
  const loan = useResource(() => getApplication(token, id), [token, id]);

  const [payWith, setPayWith] = useState<PaymentMethod>("GCASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (loan.loading || meta.loading) return <Loading />;
  if (loan.error || !loan.data) return <Alert>{loan.error || "Loan not found."}</Alert>;
  if (!meta.data) return <Alert>{meta.error || "Could not load reference data."}</Alert>;

  const a = loan.data.application;
  const q = a.quote;
  const paid = a.repayments.length;
  const next = q.schedule[paid];

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await payInstallment(token, id, payWith);
      setNotice(
        r.status === "REPAID"
          ? `Payment received (ref ${r.repayment.reference}). Your loan is fully repaid. Salamat!`
          : `Payment received (ref ${r.repayment.reference}).`
      );
      loan.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={() => go("loans")} className="text-sm font-semibold text-emerald-800 hover:underline">
        ← All loans
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{formatPeso(a.principal)}</h1>
        <StatusBadge status={a.status} />
      </div>

      {a.status === "REJECTED" && <Alert>Your application was not approved: {a.rejectionReason ?? "no reason given"}.</Alert>}
      {a.status === "SUBMITTED" && <Alert kind="info">Your application is waiting for review.</Alert>}
      {a.status === "APPROVED" && <Alert kind="success">Approved. The funds will be released to your payout account shortly.</Alert>}
      {a.disbursedAt && a.disbursementRef && (
        <Alert kind="success">
          Released on {formatDate(a.disbursedAt)} · reference {a.disbursementRef}. (Simulated transfer.)
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="You receive" value={formatPeso(q.netProceeds)} sub={`after ${formatPeso(q.deductions)} fees`} />
        <Stat label="Interest rate" value={`${percent(a.monthlyRatePercent)} / month`} />
        <Stat label="Total to repay" value={formatPeso(q.totalRepayment)} sub={`${a.termMonths} month${a.termMonths === 1 ? "" : "s"}`} />
        <Stat label="Payout to" value={meta.data.paymentMethods.find((p) => p.value === a.disbursementMethod)?.label ?? a.disbursementMethod} sub={describePayout(a, meta.data)} />
      </div>

      {a.status === "DISBURSED" && next && (
        <Card title={`Pay installment ${next.installment} of ${a.termMonths}`}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-3xl font-bold">{formatPeso(next.payment)}</p>
              <p className="mt-1 text-sm text-slate-500">Due {formatDate(next.dueDate)}</p>
            </div>
            <Field label="Pay with" htmlFor="payWith">
              <select id="payWith" value={payWith} onChange={(e) => setPayWith(e.target.value as PaymentMethod)} className={inputCls}>
                {meta.data.paymentMethods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 space-y-3">
            {error && <Alert>{error}</Alert>}
            <Button disabled={busy} onClick={() => void pay()}>
              {busy ? "Processing…" : `Pay ${formatPeso(next.payment)}`}
            </Button>
            <p className="text-xs text-slate-500">Demo checkout: the payment is simulated and no real account is charged.</p>
          </div>
        </Card>
      )}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Card title="Repayment schedule">
        <ScheduleTable rows={q.schedule} paid={paid} />
      </Card>

      {a.repayments.length > 0 && (
        <Card title="Payment history">
          <ul className="divide-y divide-slate-100 text-sm">
            {a.repayments.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>
                  Installment {r.installmentNo} · {formatPeso(r.amount)} via {meta.data!.paymentMethods.find((p) => p.value === r.method)?.label ?? r.method}
                </span>
                <span className="text-slate-500">
                  {formatDate(r.createdAt)} · {r.reference}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-500">{q.disclosure}</p>
    </div>
  );
}
