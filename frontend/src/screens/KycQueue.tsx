import { useEffect, useState } from "react";
import {
  errorMessage,
  fetchImageUrl,
  getKycForReview,
  getMeta,
  listPendingKyc,
  reviewKyc,
} from "../lib/api";
import { formatDate } from "../lib/format";
import { inputCls } from "../lib/styles";
import { useResource } from "../lib/useResource";
import { Alert, Button, Card, Empty, Field, Loading } from "../components/ui";

export default function KycQueue({ token }: { token: string }) {
  const queue = useResource(() => listPendingKyc(token), [token]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">KYC review queue</h1>
        <p className="mt-2 text-slate-500">
          Check each ID against the details entered, then approve or reject.
        </p>
      </div>
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Pending">
          {queue.loading ? (
            <Loading />
          ) : queue.error ? (
            <Alert>{queue.error}</Alert>
          ) : (queue.data?.items ?? []).length === 0 ? (
            <Empty>Nothing waiting for review.</Empty>
          ) : (
            <ul className="space-y-2">
              {queue.data!.items.map((i) => (
                <li key={i.userId}>
                  <button
                    onClick={() => {
                      setSelected(i.userId);
                      setNotice("");
                    }}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${
                      selected === i.userId
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-semibold">{i.fullName}</span>
                    <span className="text-xs text-slate-500">
                      {i.idType.replaceAll("_", " ")} ·{" "}
                      {formatDate(i.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="lg:col-span-2">
          {selected ? (
            <ReviewPanel
              key={selected}
              token={token}
              userId={selected}
              onDone={(message) => {
                setSelected(null);
                setNotice(message);
                queue.reload();
              }}
            />
          ) : (
            <Empty>Select a submission to review.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  token,
  userId,
  onDone,
}: {
  token: string;
  userId: string;
  onDone: (message: string) => void;
}) {
  const detail = useResource(
    () => getKycForReview(token, userId),
    [token, userId]
  );
  const meta = useResource(() => getMeta(), []);
  const [images, setImages] = useState<{ id: string; selfie: string } | null>(
    null
  );
  const [imageError, setImageError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kyc = detail.data?.kyc;

  // Images need the bearer token, so they are fetched as blobs and shown via object URLs.
  useEffect(() => {
    if (!kyc) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const [id, selfie] = await Promise.all([
          fetchImageUrl(kyc.idImageUrl, token),
          fetchImageUrl(kyc.selfieUrl, token),
        ]);
        urls.push(id, selfie);
        if (!cancelled) setImages({ id, selfie });
      } catch (err) {
        if (!cancelled) setImageError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [kyc, token]);

  if (detail.loading) return <Loading />;
  if (detail.error || !kyc)
    return <Alert>{detail.error || "Submission not found."}</Alert>;

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (busy) return;
    if (decision === "REJECTED" && reason.trim().length < 3) {
      setError("Enter a reason (at least 3 characters) when rejecting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await reviewKyc(token, userId, {
        decision,
        ...(decision === "REJECTED" ? { reason: reason.trim() } : {}),
      });
      onDone(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const idLabel =
    meta.data?.idTypes.find((t) => t.value === kyc.idType)?.label ?? kyc.idType;

  return (
    <Card title={kyc.fullName}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Date of birth" value={formatDate(kyc.birthDate)} />
        <Item label="ID type" value={idLabel} />
        <Item label="ID number" value={kyc.idNumber} mono />
        <Item label="Address" value={kyc.address} />
      </dl>
      {kyc.idType === "PHILID" && (
        <div className="mt-5">
          <Alert kind="info">
            To confirm this PhilID is genuine, check its QR code with the PSA's
            free{" "}
            <a
              href="https://verify.philsys.gov.ph"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              PhilSys Check
            </a>{" "}
            tool and compare the name and details with the form above.
          </Alert>
        </div>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Photo title="ID photo" src={images?.id} error={imageError} />
        <Photo title="Selfie with ID" src={images?.selfie} error={imageError} />
      </div>

      <div className="mt-5 space-y-4">
        <Field
          label="Rejection reason (required only when rejecting)"
          htmlFor="reason"
        >
          <input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className={inputCls}
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => void decide("APPROVED")}>
            Approve
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void decide("REJECTED")}
          >
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Photo({
  title,
  src,
  error,
}: {
  title: string;
  src?: string;
  error: string;
}) {
  return (
    <figure className="rounded-xl bg-slate-50 p-3">
      <figcaption className="mb-2 text-xs font-medium uppercase text-slate-500">
        {title}
      </figcaption>
      {src ? (
        <img
          src={src}
          alt={title}
          className="max-h-72 w-full rounded-lg object-contain"
        />
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">
          {error || "Loading image…"}
        </p>
      )}
    </figure>
  );
}
