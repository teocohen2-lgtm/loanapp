import { listApplications, type Application, type User } from "../lib/api";
import { formatDate, formatPeso } from "../lib/format";
import { useResource } from "../lib/useResource";
import {
  Alert,
  Button,
  Empty,
  Icon,
  Loading,
  PageHeader,
  ProgressBar,
  StatusBadge,
  type IconName,
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

  if (!isBorrower) return <StaffHome user={user} go={go} />;

  const all = loans.data ?? [];
  const active = all.filter((l) => l.status === "DISBURSED");

  // Only approved payments reduce the balance; pending ones are shown separately.
  const owed = active.reduce(
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

  const verified = user.kycStatus === "APPROVED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back"
        subtitle={
          verified
            ? "Here is where your loans stand today."
            : "Two quick steps and you can apply."
        }
      />

      {!verified && <GettingStarted user={user} go={go} />}

      {rejected.map(({ loan, payment }) => (
        <Alert key={payment.id} kind="error">
          <strong>Payment not received.</strong> Your{" "}
          {formatPeso(payment.amount)} payment (ref {payment.reference}) was not
          found
          {payment.reason ? `: ${payment.reason}` : ""}. You still need to pay.{" "}
          <button
            type="button"
            onClick={() => go("loan", loan.id)}
            className="font-semibold underline"
          >
            Pay now
          </button>
        </Alert>
      ))}
      {pendingTotal > 0 && (
        <Alert kind="info">
          {formatPeso(pendingTotal)} in payments is waiting for approval. Your
          balance updates once we confirm it.
        </Alert>
      )}

      {loans.loading ? (
        <Loading />
      ) : loans.error ? (
        <Alert>{loans.error}</Alert>
      ) : (
        <>
          {active.length > 0 && (
            <section className="overflow-hidden rounded-3xl bg-brand-900 text-white">
              <div className="p-6 sm:p-8">
                <p className="text-sm text-brand-100/80">You still owe</p>
                <p className="money mt-1 font-display text-5xl font-bold tracking-tight sm:text-6xl">
                  {formatPeso(owed)}
                </p>
                <p className="mt-2 text-sm text-brand-100/80">
                  across {active.length} active loan
                  {active.length === 1 ? "" : "s"}
                </p>
              </div>
              {next && (
                <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-950 px-6 py-5 sm:px-8">
                  <div>
                    <p className="text-sm text-brand-100/80">
                      Next payment{next.row.overdue ? " (overdue)" : ""}
                    </p>
                    <p className="money font-display text-2xl font-bold">
                      {formatPeso(next.row.remaining)}
                    </p>
                    <p className="text-sm text-brand-100/80">
                      Due {formatDate(next.row.dueDate)}
                    </p>
                  </div>
                  <Button
                    variant="accent"
                    size="lg"
                    onClick={() => go("loan", next.loan.id)}
                  >
                    Pay now
                    <Icon name="arrow" className="size-5" />
                  </Button>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="loans-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="loans-heading" className="text-xl font-semibold">
                Your loans
              </h2>
              {all.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!verified}
                  onClick={() => go("apply")}
                >
                  Apply for a loan
                </Button>
              )}
            </div>

            {all.length === 0 ? (
              <Empty
                icon="plus"
                title="No loans yet"
                action={
                  verified ? (
                    <Button onClick={() => go("apply")}>
                      Apply for a loan
                    </Button>
                  ) : (
                    <Button onClick={() => go("kyc")}>
                      Verify your ID first
                    </Button>
                  )
                }
              >
                {verified
                  ? "See your quote first. It shows every peso you will receive and pay back."
                  : "We check your ID once, then you can apply."}
              </Empty>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {all.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <LoanTile loan={l} onOpen={() => go("loan", l.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function LoanTile({ loan, onOpen }: { loan: Application; onOpen: () => void }) {
  const s = loan.summary;
  const showProgress =
    s && (loan.status === "DISBURSED" || loan.status === "REPAID");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-brand-500 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="money font-display text-2xl font-bold">
            {formatPeso(loan.principal)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {loan.termMonths} month{loan.termMonths === 1 ? "" : "s"} · applied{" "}
            {formatDate(loan.createdAt)}
          </p>
        </div>
        <StatusBadge status={loan.status} />
      </div>
      {showProgress && s && (
        <div className="mt-4 space-y-2">
          <ProgressBar
            value={Number(s.approvedPaid)}
            max={Number(s.totalDue)}
            label="Loan paid"
          />
          <p className="money flex justify-between text-sm text-slate-600">
            <span>{formatPeso(s.approvedPaid)} paid</span>
            <span>{formatPeso(s.remaining)} left</span>
          </p>
        </div>
      )}
    </button>
  );
}

function GettingStarted({
  user,
  go,
}: {
  user: User;
  go: (view: View) => void;
}) {
  const idState = user.kycStatus;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Get ready to apply</h2>
      <ol className="mt-4 space-y-4">
        <Step
          done
          title="Mobile number verified"
          text="Your account is protected by your number."
        />
        <Step
          done={idState === "APPROVED"}
          title="Verify your ID"
          text={
            idState === "PENDING"
              ? "We are checking your ID. This usually takes a short while."
              : idState === "REJECTED"
              ? "We could not accept your ID. Please send it again."
              : "Send a clear photo of a valid government ID and a selfie."
          }
          action={
            idState === "PENDING" ? undefined : (
              <Button size="sm" onClick={() => go("kyc")}>
                {idState === "REJECTED" ? "Send again" : "Verify ID"}
              </Button>
            )
          }
        />
        <Step
          done={false}
          title="Apply for a loan"
          text="Pick an amount and a term, then check your quote."
          muted
        />
      </ol>
    </section>
  );
}

function Step({
  done,
  title,
  text,
  action,
  muted = false,
}: {
  done: boolean;
  title: string;
  text: string;
  action?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className={`flex items-start gap-3 ${muted ? "opacity-60" : ""}`}>
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
          done
            ? "bg-brand-600 text-white"
            : "border-2 border-slate-300 text-slate-400"
        }`}
      >
        {done ? (
          <Icon name="check" className="size-4" />
        ) : (
          <span className="size-2 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
      {action}
    </li>
  );
}

const STAFF_TILES: {
  view: View;
  icon: IconName;
  title: string;
  text: string;
  admin?: boolean;
}[] = [
  {
    view: "kyc-queue",
    icon: "shield",
    title: "ID checks",
    text: "Review borrower IDs and selfies.",
  },
  {
    view: "admin-payments",
    icon: "wallet",
    title: "Payments",
    text: "Confirm or reject payments borrowers report.",
  },
  {
    view: "admin-loans",
    icon: "loans",
    title: "Loans",
    text: "Approve applications and release funds.",
    admin: true,
  },
  {
    view: "admin-payment-setup",
    icon: "bank",
    title: "Payment setup",
    text: "GCash, Maya and bank details, QR codes, cheques.",
    admin: true,
  },
  {
    view: "admin-pricing",
    icon: "percent",
    title: "Pricing",
    text: "Interest rate, fees and borrower rates.",
    admin: true,
  },
  {
    view: "admin-reports",
    icon: "chart",
    title: "Reports",
    text: "Download CSV reports.",
    admin: true,
  },
];

function StaffHome({ user, go }: { user: User; go: (view: View) => void }) {
  const tiles = STAFF_TILES.filter((t) => !t.admin || user.role === "ADMIN");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back"
        subtitle={
          user.role === "ADMIN"
            ? "Choose what to work on."
            : "Check IDs and confirm payments."
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.view}>
            <button
              type="button"
              onClick={() => go(t.view)}
              className="flex h-full w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-brand-500 hover:shadow-md"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon name={t.icon} className="size-6" />
              </span>
              <span>
                <span className="block font-display text-lg font-semibold">
                  {t.title}
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  {t.text}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
