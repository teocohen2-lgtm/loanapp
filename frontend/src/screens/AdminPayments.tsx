import { useState } from "react";
import {
  adminListPayments,
  adminReviewPayment,
  errorMessage,
  type PaymentStatus,
  type StaffPayment,
} from "../lib/api";
import { displayMobile, formatDate, formatPeso } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
// import { Alert, Button, Empty, Loading, StatusBadge } from "../components/ui";
import {
  Alert,
  Button,
  Chips,
  Empty,
  Loading,
  PageHeader,
  StatusBadge,
} from "../components/ui";

const TABS: { label: string; value: PaymentStatus }[] = [
  { label: "Waiting for approval", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const METHOD: Record<string, string> = {
  GCASH_QR: "GCash QR",
  MAYA_QR: "Maya QR",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
};

export default function AdminPayments({ token }: { token: string }) {
  const [tab, setTab] = useState<PaymentStatus>("PENDING");
  const [notice, setNotice] = useState("");
  const list = useResource(() => adminListPayments(token, tab), [token, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Check your GCash, Maya or bank account for each payment. Approve it only if the money arrived. Rejected payments tell the borrower to pay again."
      />

      {/* <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setTab(t.value);
              setNotice("");
            }}
            aria-pressed={tab === t.value}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              tab === t.value
                ? "border-brand-900 bg-brand-900 text-white"
                : "border-slate-300 bg-white hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div> */}
      <Chips
        options={TABS}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setNotice("");
        }}
      />

      {notice && <Alert kind="success">{notice}</Alert>}

      {list.loading ? (
        <Loading />
      ) : list.error || !list.data ? (
        <Alert>{list.error || "Could not load payments."}</Alert>
      ) : list.data.items.length === 0 ? (
        <Empty>Nothing in this list.</Empty>
      ) : (
        <div className="grid gap-4">
          {list.data.items.map((p) => (
            <PaymentRow
              key={p.id}
              token={token}
              p={p}
              onChanged={(m) => {
                setNotice(m);
                list.reload();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  token,
  p,
  onChanged,
}: {
  token: string;
  p: StaffPayment;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(decision: "APPROVED" | "REJECTED") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await adminReviewPayment(token, p.id, {
        decision,
        reason: reason.trim() || undefined,
      });
      onChanged(
        decision === "APPROVED"
          ? r.loanStatus === "REPAID"
            ? "Payment approved. The loan is now fully repaid."
            : "Payment approved."
          : "Payment rejected. The borrower will see that it was not received."
      );
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
          <p className="text-2xl font-bold">{formatPeso(p.amount)}</p>
          <p className="mt-1 text-sm text-slate-600">
            {p.borrowerName || "Borrower"} · {displayMobile(p.borrowerMobile)}
          </p>
        </div>
        <StatusBadge status={p.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Cell label="Method" value={METHOD[p.method] ?? p.method} />
        <Cell label="Reference" value={p.reference} />
        <Cell label="Submitted" value={formatDate(p.createdAt)} />
        <Cell
          label="Loan"
          value={`${formatPeso(p.loan.principal)} · ${p.loan.termMonths} mo`}
        />
        <Cell label="Loan total due" value={formatPeso(p.loan.totalDue)} />
        <Cell label="Approved so far" value={formatPeso(p.loan.approvedPaid)} />
        <Cell label="Still to pay" value={formatPeso(p.loan.remaining)} />
        {p.note && <Cell label="Borrower note" value={p.note} />}
      </dl>

      {p.rejectionReason && (
        <p className="mt-3 text-sm text-red-700">
          Rejected: {p.rejectionReason}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {p.status === "PENDING" && (
        <div className="mt-4 space-y-3">
          {rejecting && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why was it not received? (shown to the borrower)"
              maxLength={300}
              aria-label="Reason for rejection"
              className={inputCls}
            />
          )}
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Button disabled={busy} onClick={() => void act("APPROVED")}>
              Received. Approve
            </Button>
            {!rejecting ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Not received…
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={busy || reason.trim().length < 3}
                onClick={() => void act("REJECTED")}
              >
                Confirm: not received
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold">{value}</dd>
    </div>
  );
}
