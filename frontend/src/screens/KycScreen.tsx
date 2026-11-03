import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage, getMeta, getMyKyc, submitKyc } from "../lib/api";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Field, Loading, StatusBadge } from "../components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png"];

function eighteenYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toLocaleDateString("en-CA");
}

export default function KycScreen({ token, onChanged }: { token: string; onChanged: () => void }) {
  const meta = useResource(() => getMeta(), []);
  const status = useResource(() => getMyKyc(token), [token]);

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [idType, setIdType] = useState("UMID");
  const [idNumber, setIdNumber] = useState("");
  const [idImage, setIdImage] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (meta.loading || status.loading) return <Loading />;
  if (meta.error || !meta.data) return <Alert>{meta.error || "Could not load reference data."}</Alert>;
  if (status.error || !status.data) return <Alert>{status.error || "Could not load your status."}</Alert>;

  const kyc = status.data.kyc;
  const selectedId = meta.data.idTypes.find((t) => t.value === idType);

  function pick(setter: (f: File | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (file && !ALLOWED.includes(file.type)) {
        setError("Photos must be JPEG or PNG.");
        e.target.value = "";
        return setter(null);
      }
      if (file && file.size > MAX_BYTES) {
        setError("Each photo must be 5 MB or smaller.");
        e.target.value = "";
        return setter(null);
      }
      setError("");
      setter(file);
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!idImage || !selfie) {
      setError("Please attach both the ID photo and the selfie.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("fullName", fullName.trim());
      form.set("birthDate", birthDate);
      form.set("address", address.trim());
      form.set("idType", idType);
      form.set("idNumber", idNumber.trim());
      form.set("idImage", idImage);
      form.set("selfie", selfie);
      await submitKyc(token, form);
      setDone(true);
      status.reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div>
      <h1 className="text-3xl font-bold">Identity verification</h1>
      <p className="mt-2 text-slate-500">A one-time check required before you can borrow.</p>
    </div>
  );

  if (kyc.status === "APPROVED")
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <div className="flex items-center gap-3">
            <StatusBadge status="APPROVED" />
            <p className="text-sm text-slate-600">
              Your {meta.data.idTypes.find((t) => t.value === kyc.idType)?.label ?? "ID"} ending in{" "}
              <strong>{kyc.idNumberLast4}</strong> is verified.
            </p>
          </div>
        </Card>
      </div>
    );

  if (kyc.status === "PENDING" || done)
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <div className="flex items-center gap-3">
            <StatusBadge status="PENDING" />
            <p className="text-sm text-slate-600">
              We received your documents and a reviewer will check them shortly. Refresh this page to see updates.
            </p>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      {header}

      {kyc.status === "REJECTED" && (
        <Alert>Your previous submission was rejected: {kyc.rejectionReason ?? "no reason given"}. Please resubmit.</Alert>
      )}

      <Card title="What you will need">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          {meta.data.documentRequirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>

      <Card title="Your details">
        <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
          <Field label="Full name (as on your ID)" htmlFor="fullName">
            <input id="fullName" required minLength={2} maxLength={120} value={fullName}
              onChange={(e) => setFullName(e.target.value)} disabled={busy} className={inputCls} />
          </Field>
          <Field label="Date of birth" htmlFor="birthDate" hint="You must be at least 18 years old.">
            <input id="birthDate" type="date" required max={eighteenYearsAgo()} value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)} disabled={busy} className={inputCls} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Complete residential address" htmlFor="address" hint="House/unit no., street, barangay, city/municipality, province">
              <textarea id="address" required minLength={10} maxLength={300} rows={3} value={address}
                onChange={(e) => setAddress(e.target.value)} disabled={busy} className={inputCls} />
            </Field>
          </div>
          <Field label="Government ID type" htmlFor="idType">
            <select id="idType" value={idType} onChange={(e) => setIdType(e.target.value)} disabled={busy} className={inputCls}>
              {meta.data.idTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ID number" htmlFor="idNumber" hint={selectedId?.hint}>
            <input id="idNumber" required value={idNumber} placeholder={selectedId?.placeholder}
              onChange={(e) => setIdNumber(e.target.value)} disabled={busy} className={inputCls} />
          </Field>
          <Field label="Photo of the ID (front)" htmlFor="idImage" hint="JPEG or PNG, up to 5 MB">
            <input id="idImage" type="file" accept="image/jpeg,image/png" required onChange={pick(setIdImage)}
              disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:text-white" />
          </Field>
          <Field label="Selfie holding the same ID" htmlFor="selfie" hint="JPEG or PNG, up to 5 MB">
            <input id="selfie" type="file" accept="image/jpeg,image/png" required onChange={pick(setSelfie)}
              disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:text-white" />
          </Field>
          <div className="space-y-4 md:col-span-2">
            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
