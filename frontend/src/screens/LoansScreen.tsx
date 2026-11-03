import { useEffect, useState } from "react";
import {
  errorMessage,
  fetchQrUrl,
  getApplication,
  getMeta,
  getPaymentInfo,
  listApplications,
  submitPayment,
  type Application,
  type CollectionMethod,
  type InstallmentState,
  type LoanLedger,
  type Meta,
  type PayMethodInfo,
  type Payment,
} from "../lib/api";
import { displayMobile, formatDate, formatPeso, percent } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import {
  Alert,
  Button,
  Card,
  Empty,
  Field,
  Icon,
  Loading,
  PageHeader,
  ProgressBar,
  Resibo,
  ResiboRow,
  StatusBadge,
} from "../components/ui";
import type { View } from "../lib/view";

export function describePayout(a: Application, meta: Meta): string {
  const method = meta.paymentMethods.find(
    (p) => p.value === a.disbursementMethod
  );
  const label = method?.label ?? a.disbursementMethod;
  if (method?.kind === "BANK") {
    const bank =
      meta.banks.find((b) => b.code === a.disbursementBankCode)?.name ??
      a.disbursementBankCode;
    return `${label} · ${bank} · account ending ${a.disbursementAccount.slice(
      -4
    )}`;
  }
  return `${label} · ${displayMobile(a.disbursementAccount)}`;
}

const METHOD_LABEL: Record<CollectionMethod, string> = {
  GCASH_QR: "GCash QR",
  MAYA_QR: "Maya QR",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
};

export function LoansList({
  token,
  go,
}: {
  token: string;
  go: (view: View, loanId?: string) => void;
}) {
  const loans = useResource(() => listApplications(token), [token]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My loans"
        subtitle="Every application and what you still owe."
        action={<Button onClick={() => go("apply")}>New application</Button>}
      />

      {loans.loading ? (
        <Loading />
      ) : loans.error ? (
        <Alert>{loans.error}</Alert>
      ) : (loans.data?.items ?? []).length === 0 ? (
        <Empty
          icon="plus"
          title="No loans yet"
          action={<Button onClick={() => go("apply")}>Apply for a loan</Button>}
        >
          Your applications will show here with their progress.
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {loans.data!.items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => go("loan", l.id)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-brand-500 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="money font-display text-2xl font-bold">
                      {formatPeso(l.principal)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {l.termMonths} month{l.termMonths === 1 ? "" : "s"} ·
                      applied {formatDate(l.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                {l.summary &&
                  (l.status === "DISBURSED" || l.status === "REPAID") && (
                    <div className="mt-4 space-y-2">
                      <ProgressBar
                        value={Number(l.summary.approvedPaid)}
                        max={Number(l.summary.totalDue)}
                        label="Loan paid"
                      />
                      <p className="money flex justify-between text-sm text-slate-600">
                        <span>
                          {l.summary.paidInstallments} of {l.termMonths} paid
                        </span>
                        <span>{formatPeso(l.summary.remaining)} left</span>
                      </p>
                    </div>
                  )}
                {l.summary && l.summary.pendingCount > 0 && (
                  <p className="mt-3 text-sm font-semibold text-amber-800">
                    {formatPeso(l.summary.pendingAmount)} waiting for approval
                  </p>
                )}
                {l.summary && l.summary.rejectedNeedingAction.length > 0 && (
                  <p className="mt-3 text-sm font-semibold text-red-700">
                    Payment not received. Please pay again.
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LoanDetail({
  token,
  id,
  go,
}: {
  token: string;
  id: string;
  go: (view: View) => void;
}) {
  const meta = useResource(() => getMeta(), []);
  const loan = useResource(() => getApplication(token, id), [token, id]);
  const [notice, setNotice] = useState("");

  if (loan.loading || meta.loading) return <Loading />;
  if (loan.error || !loan.data)
    return <Alert>{loan.error || "Loan not found."}</Alert>;
  if (!meta.data)
    return <Alert>{meta.error || "Could not load reference data."}</Alert>;

  const a = loan.data.application;
  const q = a.quote;
  const { ledger, payments } = loan.data;
  const active = a.status === "DISBURSED";

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => go("loans")}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-800 hover:underline"
      >
        <Icon name="chevron" className="size-4 rotate-180" /> All loans
      </button>

      <section className="rounded-3xl bg-brand-900 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-100/80">Loan amount</p>
            <p className="money font-display text-4xl font-bold sm:text-5xl">
              {formatPeso(a.principal)}
            </p>
          </div>
          <StatusBadge status={a.status} />
        </div>
        {(active || a.status === "REPAID") && (
          <div className="mt-6 space-y-3">
            <ProgressBar
              onDark
              value={Number(ledger.approvedPaid)}
              max={Number(ledger.totalDue)}
              label="Loan paid"
            />
            <p className="money flex flex-wrap justify-between gap-2 text-sm text-brand-100">
              <span>
                {formatPeso(ledger.approvedPaid)} paid of{" "}
                {formatPeso(ledger.totalDue)}
              </span>
              <span className="font-semibold text-white">
                {formatPeso(ledger.remaining)} left · {ledger.paidInstallments}{" "}
                of {a.termMonths} months paid
              </span>
            </p>
          </div>
        )}
      </section>

      {a.status === "REJECTED" && (
        <Alert>
          Your application was not approved:{" "}
          {a.rejectionReason ?? "no reason given"}.
        </Alert>
      )}
      {a.status === "SUBMITTED" && (
        <Alert kind="info">Your application is waiting for review.</Alert>
      )}
      {a.status === "APPROVED" && (
        <Alert kind="success">
          Approved. The funds will be released to your payout account shortly.
        </Alert>
      )}
      {a.status === "REPAID" && (
        <Alert kind="success">This loan is fully paid. Salamat!</Alert>
      )}
      {a.disbursedAt && a.disbursementRef && (
        <Alert kind="success">
          Released on {formatDate(a.disbursedAt)} · reference{" "}
          {a.disbursementRef}.
        </Alert>
      )}

      {active &&
        ledger.rejectedNeedingAction.map((r) => (
          <Alert key={r.id} kind="error">
            <strong>Payment not received.</strong> Your {formatPeso(r.amount)}{" "}
            payment ({METHOD_LABEL[r.method]}, ref {r.reference}) was not found
            {r.reason ? `: ${r.reason}` : ""}. You still need to pay. Please
            send it again and submit the new reference.
          </Alert>
        ))}
      {active && ledger.pendingCount > 0 && (
        <Alert kind="info">
          {formatPeso(ledger.pendingAmount)} is waiting for approval. It will
          count toward your balance once we confirm we received the money.
        </Alert>
      )}
      {active && ledger.overdueCount > 0 && (
        <Alert kind="warning">
          You have {ledger.overdueCount} overdue payment
          {ledger.overdueCount === 1 ? "" : "s"}. Please pay as soon as you can.
        </Alert>
      )}

      {active && ledger.availableToSubmit !== "0.00" && (
        <PayPanel
          token={token}
          loanId={id}
          ledger={ledger}
          onSubmitted={(m) => {
            setNotice(m);
            loan.reload();
          }}
        />
      )}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Resibo title="Loan receipt" className="lg:col-span-2">
          <ResiboRow label="Loan amount" value={formatPeso(a.principal)} />
          <ResiboRow
            label="Fees taken out"
            value={`−${formatPeso(q.deductions)}`}
            muted
          />
          <ResiboRow
            label="You received"
            value={formatPeso(q.netProceeds)}
            strong
            divider
          />
          <ResiboRow
            label="Interest rate"
            value={`${percent(a.monthlyRatePercent)} a month`}
          />
          <ResiboRow
            label="Total interest"
            value={formatPeso(q.totalInterest)}
            muted
          />
          <ResiboRow
            label="Total to pay back"
            value={formatPeso(q.totalRepayment)}
            strong
            divider
          />
          <ResiboRow
            label="Money sent to"
            value={describePayout(a, meta.data)}
            muted
          />
        </Resibo>

        <div className="lg:col-span-3">
          <Card title="Month by month">
            <StatementTable
              installments={ledger.installments}
              schedule={q.schedule}
            />
          </Card>
        </div>
      </div>

      {payments.length > 0 && (
        <Card title="Payment history">
          <ul className="divide-y divide-slate-100 text-sm">
            {payments.map((p) => (
              <PaymentLine key={p.id} p={p} />
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Only payments we have confirmed are counted. Payments waiting for
        approval or not received do not reduce your balance.
      </p>
    </div>
  );
}

function PaymentLine({ p }: { p: Payment }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold">{formatPeso(p.amount)}</span> via{" "}
          {METHOD_LABEL[p.method] ?? p.method}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-slate-500">{formatDate(p.createdAt)}</span>
          <StatusBadge
            status={
              p.status === "APPROVED"
                ? "APPROVED"
                : p.status === "REJECTED"
                ? "REJECTED"
                : "PENDING"
            }
          />
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Ref {p.reference}
        {p.status === "PENDING" && " · waiting for approval"}
        {p.status === "REJECTED" &&
          ` · not received${p.rejectionReason ? `: ${p.rejectionReason}` : ""}`}
      </p>
    </li>
  );
}

function StatementTable({
  installments,
  schedule,
}: {
  installments: InstallmentState[];
  schedule: {
    installment: number;
    principal: string;
    interest: string;
    payment: string;
  }[];
}) {
  return (
    <ol className="relative space-y-0">
      {installments.map((i, index) => {
        const row = schedule.find((s) => s.installment === i.installment);
        const state =
          i.status === "PAID" ? "PAID" : i.overdue ? "OVERDUE" : i.status;
        const dot =
          state === "PAID"
            ? "bg-brand-600 text-white"
            : state === "OVERDUE"
            ? "bg-red-600 text-white"
            : state === "PARTIAL"
            ? "bg-mango-400 text-brand-950"
            : "border-2 border-slate-300 bg-white text-slate-500";
        return (
          <li key={i.installment} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${dot}`}
              >
                {state === "PAID" ? (
                  <Icon name="check" className="size-4" />
                ) : (
                  i.installment
                )}
              </span>
              {index < installments.length - 1 && (
                <span className="my-1 w-0.5 flex-1 bg-slate-200" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{formatDate(i.dueDate)}</p>
                <StatusBadge status={state} />
              </div>
              <p className="money mt-0.5 text-sm text-slate-600">
                {formatPeso(i.amountDue)} due
                {Number(i.paid) > 0 &&
                  i.status !== "PAID" &&
                  ` · ${formatPeso(i.paid)} paid · ${formatPeso(
                    i.remaining
                  )} left`}
                {i.status === "PAID" && " · paid in full"}
              </p>
              {row && (
                <p className="money text-xs text-slate-500">
                  Principal {formatPeso(row.principal)} + interest{" "}
                  {formatPeso(row.interest)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function QrImage({ token, kind }: { token: string; kind: "GCASH" | "MAYA" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    void fetchQrUrl(token, kind).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      setUrl(u);
    });
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, kind]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt={`${kind === "GCASH" ? "GCash" : "Maya"} QR code`}
      className="mx-auto mt-3 w-56 rounded-xl border border-slate-200"
      onError={() => setUrl(null)}
    />
  );
}

function PayPanel({
  token,
  loanId,
  ledger,
  onSubmitted,
}: {
  token: string;
  loanId: string;
  ledger: LoanLedger;
  onSubmitted: (message: string) => void;
}) {
  const info = useResource(() => getPaymentInfo(token), [token]);
  const [method, setMethod] = useState<CollectionMethod | "">("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (info.loading) return <Loading />;
  if (info.error || !info.data)
    return <Alert>{info.error || "Could not load payment options."}</Alert>;

  const methods = info.data.methods;
  if (methods.length === 0)
    return (
      <Alert kind="warning">
        Payment details have not been set up yet. Please contact us.
      </Alert>
    );

  const selected: PayMethodInfo | undefined = methods.find(
    (m) => m.value === (method || methods[0].value)
  );
  const chosen = selected!.value;
  const next = ledger.next;
  const suggestion =
    next && Number(next.remaining) > 0
      ? Math.min(
          Number(next.remaining),
          Number(ledger.availableToSubmit)
        ).toFixed(2)
      : ledger.availableToSubmit;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submitPayment(token, loanId, {
        method: chosen,
        amount: amount || suggestion,
        reference,
        note: note.trim() || undefined,
      });
      setAmount("");
      setReference("");
      setNote("");
      onSubmitted(
        "Thank you! We got your payment details. It will show in your balance once we confirm we received the money."
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Make a payment">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {next && (
            <p className="text-sm text-slate-600">
              Next due: <strong>{formatPeso(next.remaining)}</strong> on{" "}
              {formatDate(next.dueDate)}. You can pay part of it, but not more
              than {formatPeso(ledger.availableToSubmit)} right now.
            </p>
          )}
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-slate-800">
              Pay with
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  aria-pressed={chosen === m.value}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold transition ${
                    chosen === m.value
                      ? "border-brand-700 bg-brand-50 ring-2 ring-brand-200"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Icon
                    name={
                      m.value === "BANK_TRANSFER"
                        ? "bank"
                        : m.value === "CHEQUE"
                        ? "doc"
                        : "qr"
                    }
                    className="size-5 text-brand-700"
                  />
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">Step 1. Send your payment to</p>
            <p className="mt-1">{selected!.accountName}</p>
            {selected!.bankName && <p>{selected!.bankName}</p>}
            <p className="font-mono text-base">{selected!.accountNumber}</p>
            {selected!.instructions && (
              <p className="mt-2 text-slate-600">{selected!.instructions}</p>
            )}
            {selected!.hasQr &&
              (selected!.kind === "GCASH" || selected!.kind === "MAYA") && (
                <QrImage token={token} kind={selected!.kind} />
              )}
            {chosen === "CHEQUE" && (
              <p className="mt-2 text-slate-600">
                Make the cheque payable to the account name above, then enter
                the cheque number below.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Field
            label="Step 2. Amount you paid (₱)"
            htmlFor="amount"
            hint={`Minimum ${formatPeso(info.data.minAmount)}`}
          >
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={suggestion}
              className={inputCls}
            />
          </Field>
          <Field
            label={chosen === "CHEQUE" ? "Cheque number" : "Reference number"}
            htmlFor="reference"
            hint="From your GCash, Maya or bank receipt"
          >
            <input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={40}
              className={inputCls}
            />
          </Field>
          <Field label="Note (optional)" htmlFor="note">
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className={inputCls}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button
            size="lg"
            className="w-full"
            disabled={busy || reference.trim().length < 4}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : "I have paid. Send for approval"}
          </Button>
          <p className="text-xs text-slate-500">
            Pay first through the account on the left, then enter what you paid.
            Your balance changes only after we confirm the money arrived.
          </p>
        </div>
      </div>
    </Card>
  );
}
