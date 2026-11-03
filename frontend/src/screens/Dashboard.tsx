import { listApplications, type Application, type User } from "../lib/api";
import { displayMobile, formatDate, formatPeso } from "../lib/format";
import { useResource } from "../lib/useResource";
import {
  Alert,
  Button,
  Card,
  Loading,
  Stat,
  StatusBadge,
} from "../components/ui";
import type { View } from "../lib/view";

export default function Dashboard({
  token,
  user,
  go,
}: {
  token: string;
  user: User;
  go: (view: View, loanId?: string) => void;
}) {
  const isBorrower = user.role === "BORROWER";
  const loans = useResource(
    async () => (isBorrower ? (await listApplications(token)).items : []),
    [token, isBorrower]
  );

  const active = (loans.data ?? []).filter((l) => l.status === "DISBURSED");
  // // const outstanding = active.reduce((total, l) => total + remaining(l), 0);

  // const next = active
  //   .map((l) => ({ loan: l, row: l.quote.schedule[paidCount(l)] }))
  //   .filter((x) => x.row)
  //   .sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate))[0];

  // Only approved payments reduce the balance; pending ones are shown separately.
  const outstanding = active.reduce(
    (total, l) => total + Number(l.summary?.remaining ?? 0),
    0
  );
  const pendingTotal = active.reduce(
    (total, l) => total + Number(l.summary?.pendingAmount ?? 0),
    0
  );
  const rejected = active.flatMap((l) =>
    (l.summary?.rejectedNeedingAction ?? []).map((r) => ({
      loan: l,
      payment: r,
    }))
  );

  const next = active
    .map((l) => ({ loan: l, row: l.summary?.next ?? null }))
    .filter(
      (x): x is { loan: Application; row: NonNullable<typeof x.row> } =>
        x.row !== null
    )
    .sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate))[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-slate-500">
          {displayMobile(user.mobileNumber)}
        </p>
      </div>

      {isBorrower ? (
        <>
          {user.kycStatus !== "APPROVED" && (
            <Alert kind={user.kycStatus === "REJECTED" ? "error" : "warning"}>
              {user.kycStatus === "PENDING"
                ? "Your ID is being reviewed. You can apply as soon as it is approved."
                : user.kycStatus === "REJECTED"
                ? "Your ID verification was rejected. Please resubmit your details."
                : "Verify your identity to unlock loan applications."}{" "}
              {user.kycStatus !== "PENDING" && (
                <button
                  onClick={() => go("kyc")}
                  className="font-semibold underline"
                >
                  Go to verification
                </button>
              )}
            </Alert>
          )}
          {rejected.map(({ loan, payment }) => (
            <Alert key={payment.id} kind="error">
              <strong>Payment not received.</strong> Your{" "}
              {formatPeso(payment.amount)} payment (ref {payment.reference}) was
              not found
              {payment.reason ? `: ${payment.reason}` : ""}. You still need to
              pay.{" "}
              <button
                onClick={() => go("loan", loan.id)}
                className="font-semibold underline"
              >
                Pay now
              </button>
            </Alert>
          ))}
          {pendingTotal > 0 && (
            <Alert kind="info">
              {formatPeso(pendingTotal)} in payments is waiting for approval.
              Your balance updates once we confirm it.
            </Alert>
          )}

          <div className="grid gap-5 md:grid-cols-3">
            <Stat
              label="Mobile"
              value={user.isMobileVerified ? "Verified" : "Not verified"}
            />
            <Stat
              label="Identity (KYC)"
              value={user.kycStatus.replaceAll("_", " ")}
            />
            <Stat
              label="Outstanding balance"
              value={formatPeso(outstanding)}
              sub={`${active.length} active loan${
                active.length === 1 ? "" : "s"
              }`}
            />
          </div>

          {next && (
            <Card title="Next payment due">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold">
                    {formatPeso(next.row.remaining)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Due {formatDate(next.row.dueDate)} · installment{" "}
                    {next.row.overdue ? " · overdue" : ""}
                    {next.row.installment} of {next.loan.termMonths}
                  </p>
                </div>
                <Button onClick={() => go("loan", next.loan.id)}>
                  Pay now
                </Button>
              </div>
            </Card>
          )}

          <Card
            title="Recent applications"
            action={
              <Button
                disabled={user.kycStatus !== "APPROVED"}
                onClick={() => go("apply")}
              >
                Apply for a loan
              </Button>
            }
          >
            {loans.loading ? (
              <Loading />
            ) : loans.error ? (
              <Alert>{loans.error}</Alert>
            ) : (loans.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No applications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(loans.data ?? []).slice(0, 5).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <button
                      onClick={() => go("loan", l.id)}
                      className="text-left"
                    >
                      <span className="font-semibold">
                        {formatPeso(l.principal)}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">
                        {l.termMonths} month{l.termMonths === 1 ? "" : "s"} ·{" "}
                        {formatDate(l.createdAt)}
                      </span>
                    </button>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <Stat
            label="Role"
            value={user.role === "ADMIN" ? "Administrator" : "KYC reviewer"}
          />
          <Stat label="Mobile" value="Verified" />
          <Stat
            label="Next step"
            value={
              user.role === "ADMIN"
                ? "Review KYC and loans"
                : "Review KYC queue"
            }
          />
        </div>
      )}
    </div>
  );
}
