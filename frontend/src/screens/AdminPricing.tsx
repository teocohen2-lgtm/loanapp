import { useState } from "react";
import type { FormEvent } from "react";
import {
  adminCreatePolicy,
  adminListBorrowers,
  adminListPolicies,
  adminSetBorrowerRate,
  errorMessage,
  type AdminBorrower,
} from "../lib/api";
import { displayMobile, formatDate, formatPeso, percent } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Empty, Field, Loading } from "../components/ui";

export default function AdminPricing({ token }: { token: string }) {
  const policies = useResource(() => adminListPolicies(token), [token]);
  const borrowers = useResource(() => adminListBorrowers(token), [token]);

  const current = policies.data?.items[0];

  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [dstPayer, setDstPayer] = useState<"LENDER" | "BORROWER">("LENDER");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function createPolicy(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminCreatePolicy(token, {
        monthlyRatePercent: rate.trim(),
        processingFee: fee.trim(),
        dstPayer,
        reason: reason.trim(),
      });
      setNotice("New pricing version created. It applies to new applications only.");
      setReason("");
      policies.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-slate-500">
          Product-default rate and fee, plus optional per-borrower rates. Changes affect new applications only.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current product pricing">
          {policies.loading ? (
            <Loading />
          ) : policies.error ? (
            <Alert>{policies.error}</Alert>
          ) : current ? (
            <dl className="space-y-2 text-sm">
              <Line label="Version" value={`v${current.version}`} />
              <Line label="Monthly interest" value={percent(current.monthlyRatePercent)} />
              <Line label="Processing fee" value={formatPeso(current.processingFee)} />
              <Line label="DST paid by" value={current.dstPayer === "LENDER" ? "Lender" : "Borrower"} />
              <Line label="Set on" value={formatDate(current.createdAt)} />
              <p className="pt-2 text-xs text-slate-500">{current.reason}</p>
            </dl>
          ) : (
            <Empty>No pricing configured yet. Create the first version.</Empty>
          )}
        </Card>

        <Card title="Create a new version">
          <form onSubmit={createPolicy} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monthly interest (%)" htmlFor="rate" hint="Max 6% (SEC nominal cap)">
                <input id="rate" required inputMode="decimal" placeholder="3.00" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Processing fee (₱)" htmlFor="fee">
                <input id="fee" required inputMode="decimal" placeholder="50.00" value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Documentary stamp tax paid by" htmlFor="dst">
              <select id="dst" value={dstPayer} onChange={(e) => setDstPayer(e.target.value as "LENDER" | "BORROWER")} className={inputCls}>
                <option value="LENDER">Lender</option>
                <option value="BORROWER">Borrower (deducted from proceeds)</option>
              </select>
            </Field>
            <Field label="Reason for the change" htmlFor="policyReason" hint="At least 10 characters; kept in the audit log.">
              <input id="policyReason" required minLength={10} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
            </Field>
            {error && <Alert>{error}</Alert>}
            {notice && <Alert kind="success">{notice}</Alert>}
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create version"}</Button>
          </form>
        </Card>
      </div>

      <Card title="Borrower-specific rates">
        {borrowers.loading ? (
          <Loading />
        ) : borrowers.error || !borrowers.data ? (
          <Alert>{borrowers.error || "Could not load borrowers."}</Alert>
        ) : borrowers.data.items.length === 0 ? (
          <Empty>No borrowers yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {borrowers.data.items.map((b) => (
              <BorrowerRow key={b.id} token={token} borrower={b} onChanged={borrowers.reload} />
            ))}
          </ul>
        )}
      </Card>

      {policies.data && policies.data.items.length > 1 && (
        <Card title="Pricing history">
          <ul className="divide-y divide-slate-100 text-sm">
            {policies.data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="font-semibold">v{p.version} · {percent(p.monthlyRatePercent)} · {formatPeso(p.processingFee)}</span>
                <span className="text-slate-500">{formatDate(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function BorrowerRow({ token, borrower, onChanged }: { token: string; borrower: AdminBorrower; onChanged: () => void }) {
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(monthlyRatePercent: string | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminSetBorrowerRate(token, borrower.id, { monthlyRatePercent, reason: reason.trim() });
      setRate("");
      setReason("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <strong>{borrower.kycProfile?.fullName ?? "No KYC yet"}</strong>{" "}
          <span className="text-slate-500">{displayMobile(borrower.mobileNumber)} · KYC {borrower.kycStatus.replaceAll("_", " ").toLowerCase()}</span>
        </span>
        <span className="font-semibold">
          {borrower.rateOverride ? `Custom ${percent(borrower.rateOverride.monthlyRatePercent)}` : "Product default"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Custom monthly rate (%)" placeholder="Rate %" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputCls} !w-28`} />
        <input aria-label="Reason" placeholder="Reason (min 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} min-w-56 flex-1`} />
        <Button disabled={busy || !rate.trim() || reason.trim().length < 10} onClick={() => void save(rate.trim())}>Set rate</Button>
        {borrower.rateOverride && (
          <Button variant="secondary" disabled={busy || reason.trim().length < 10} onClick={() => void save(null)}>Clear</Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </li>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
