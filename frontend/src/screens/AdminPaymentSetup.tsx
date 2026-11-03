import { useState } from "react";
import {
  adminListAccounts,
  adminListBorrowers,
  adminSaveAccount,
  adminSetCheque,
  adminUploadQr,
  errorMessage,
  type ReceivingAccount,
} from "../lib/api";
import { displayMobile } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Field, Loading } from "../components/ui";

const KINDS: {
  kind: ReceivingAccount["kind"];
  title: string;
  numberLabel: string;
}[] = [
  { kind: "GCASH", title: "GCash", numberLabel: "GCash number" },
  { kind: "MAYA", title: "Maya", numberLabel: "Maya number" },
  {
    kind: "BANK",
    title: "Bank account (transfer and cheque)",
    numberLabel: "Account number",
  },
];

export default function AdminPaymentSetup({ token }: { token: string }) {
  const accounts = useResource(() => adminListAccounts(token), [token]);
  const borrowers = useResource(() => adminListBorrowers(token), [token]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function toggleCheque(userId: string, allowed: boolean) {
    setError("");
    try {
      await adminSetCheque(token, userId, allowed);
      setNotice(
        allowed
          ? "Cheque payments switched on for this borrower."
          : "Cheque payments switched off for this borrower."
      );
      borrowers.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment setup</h1>
        <p className="mt-2 text-slate-500">
          Borrowers see these details when they pay. A method appears only when
          it is saved and switched on.
        </p>
      </div>

      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {accounts.loading ? (
        <Loading />
      ) : accounts.error || !accounts.data ? (
        <Alert>{accounts.error || "Could not load accounts."}</Alert>
      ) : (
        KINDS.map((k) => (
          <AccountForm
            key={k.kind}
            token={token}
            spec={k}
            existing={accounts.data!.items.find((a) => a.kind === k.kind)}
            onSaved={(m) => {
              setNotice(m);
              accounts.reload();
            }}
          />
        ))
      )}

      <Card title="Cheque payments, per borrower">
        <p className="mb-4 text-sm text-slate-500">
          Cheques are not accepted unless you switch them on for a borrower
          here. The bank account above is used for cheques.
        </p>
        {borrowers.loading ? (
          <Loading />
        ) : borrowers.error || !borrowers.data ? (
          <Alert>{borrowers.error || "Could not load borrowers."}</Alert>
        ) : borrowers.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">No borrowers yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {borrowers.data.items.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="font-semibold">
                    {b.kycProfile?.fullName ?? "Borrower"}
                  </span>{" "}
                  <span className="text-slate-500">
                    {displayMobile(b.mobileNumber)}
                  </span>
                </span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={b.chequeAllowed}
                    onChange={(e) => void toggleCheque(b.id, e.target.checked)}
                  />
                  Allow cheque
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AccountForm({
  token,
  spec,
  existing,
  onSaved,
}: {
  token: string;
  spec: (typeof KINDS)[number];
  existing?: ReceivingAccount;
  onSaved: (message: string) => void;
}) {
  const [accountName, setAccountName] = useState(existing?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(
    existing?.accountNumber ?? ""
  );
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [instructions, setInstructions] = useState(
    existing?.instructions ?? ""
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminSaveAccount(token, spec.kind, {
        accountName,
        accountNumber,
        bankName: spec.kind === "BANK" ? bankName : undefined,
        instructions: instructions || undefined,
        active,
      });
      onSaved(`${spec.title} saved.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminUploadQr(token, spec.kind as "GCASH" | "MAYA", file);
      onSaved(`${spec.title} QR code uploaded.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={spec.title}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" htmlFor={`${spec.kind}-name`}>
          <input
            id={`${spec.kind}-name`}
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </Field>
        <Field label={spec.numberLabel} htmlFor={`${spec.kind}-number`}>
          <input
            id={`${spec.kind}-number`}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            maxLength={40}
            className={inputCls}
          />
        </Field>
        {spec.kind === "BANK" && (
          <Field label="Bank name" htmlFor="bank-name">
            <input
              id="bank-name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              maxLength={80}
              className={inputCls}
            />
          </Field>
        )}
        <Field
          label="Instructions for borrowers (optional)"
          htmlFor={`${spec.kind}-instr`}
        >
          <input
            id={`${spec.kind}-instr`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={300}
            className={inputCls}
          />
        </Field>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Show this method to borrowers
      </label>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          disabled={
            busy ||
            accountName.trim().length < 2 ||
            accountNumber.trim().length < 4
          }
          onClick={() => void save()}
        >
          Save
        </Button>
        {spec.kind !== "BANK" && (
          <label
            className={`text-sm font-semibold ${
              existing
                ? "cursor-pointer text-brand-800 hover:underline"
                : "text-slate-400"
            }`}
          >
            {existing?.hasQr ? "Replace QR image" : "Upload QR image"} (JPEG or
            PNG)
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              disabled={!existing || busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {spec.kind !== "BANK" && !existing && (
          <span className="text-xs text-slate-500">
            Save the details first, then upload the QR.
          </span>
        )}
      </div>
    </Card>
  );
}
