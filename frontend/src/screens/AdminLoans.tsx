import { useState } from "react";
import {
  adminDisburse,
  adminListApplications,
  adminReviewApplication,
  errorMessage,
  getMeta,
  type Application,
  type LoanStatus,
} from "../lib/api";
import { formatDate, formatPeso, percent } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Empty, Loading, StatusBadge } from "../components/ui";
import { describePayout } from "./LoansScreen";

const FILTERS: { label: string; value: LoanStatus | undefined }[] = [
  { label: "Needs review", value: "SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Disbursed", value: "DISBURSED" },
  { label: "Repaid", value: "REPAID" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All", value: undefined },
];

export default function AdminLoans({ token }: { token: string }) {
  const [filter, setFilter] = useState<LoanStatus | undefined>("SUBMITTED");
  const meta = useResource(() => getMeta(), []);
  const loans = useResource(() => adminListApplications(token, filter), [token, filter]);
  const [notice, setNotice] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Loan applications</h1>
        <p className="mt-2 text-slate-500">Approve or reject applications, then release approved loans.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.label} onClick={() => { setFilter(f.value); setNotice(""); }} aria-pressed={filter === f.value}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === f.value ? "border-emerald-900 bg-emerald-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {notice && <Alert kind="success">{notice}</Alert>}

      {loans.loading || meta.loading ? (
        <Loading />
      ) : loans.error || !loans.data ? (
        <Alert>{loans.error || "Could not load applications."}</Alert>
      ) : !meta.data ? (
        <Alert>{meta.error || "Could not load reference data."}</Alert>
      ) : loans.data.items.length === 0 ? (
        <Empty>No applications in this list.</Empty>
      ) : (
        <div className="grid gap-4">
          {loans.data.items.map((a) => (
            <ApplicationRow key={a.id} token={token} app={a} payout={describePayout(a, meta.data!)}
              onChanged={(message) => { setNotice(message); loans.reload(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({
  token,
  app,
  payout,
  onChanged,
}: {
  token: string;
  app: Application;
  payout: string;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const q = app.quote;

  async function act(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onChanged(await fn());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-bold">
            {formatPeso(app.principal)} <span className="text-sm font-normal text-slate-500">· {app.termMonths} month{app.termMonths === 1 ? "" : "s"}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {app.user?.kycProfile?.fullName ?? "Borrower"} · {app.user?.mobileNumber}
          </p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <Cell label="Rate" value={`${percent(app.monthlyRatePercent)} / mo`} />
        <Cell label="Net proceeds" value={formatPeso(q.netProceeds)} />
        <Cell label="Total repayment" value={formatPeso(q.totalRepayment)} />
        <Cell label="Applied" value={formatDate(app.createdAt)} />
        <div className="sm:col-span-4">
          <Cell label="Payout" value={payout} />
        </div>
      </dl>

      {app.rejectionReason && <p className="mt-3 text-sm text-red-700">Rejected: {app.rejectionReason}</p>}
      {app.disbursementRef && <p className="mt-3 text-sm text-slate-500">Disbursement ref {app.disbursementRef}</p>}

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      {app.status === "SUBMITTED" && (
        <div className="mt-4 space-y-3">
          {rejecting && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" maxLength={300}
              aria-label="Reason for rejection" className={inputCls} />
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => void act(async () => {
              await adminReviewApplication(token, app.id, { decision: "APPROVED" });
              return "Application approved.";
            })}>Approve</Button>
            {!rejecting ? (
              <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject…</Button>
            ) : (
              <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void act(async () => {
                await adminReviewApplication(token, app.id, { decision: "REJECTED", reason: reason.trim() });
                return "Application rejected.";
              })}>Confirm rejection</Button>
            )}
          </div>
        </div>
      )}

      {app.status === "APPROVED" && (
        <div className="mt-4">
          <Button disabled={busy} onClick={() => void act(async () => {
            const r = await adminDisburse(token, app.id);
            return `Released ${formatPeso(r.amount)} (${r.eta}).`;
          })}>{busy ? "Releasing…" : `Release ${formatPeso(q.netProceeds)}`}</Button>
        </div>
      )}
    </article>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
