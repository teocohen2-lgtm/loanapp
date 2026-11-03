import { useCallback, useEffect, useState } from "react";
import {
  getMe,
  loadSession,
  saveSession,
  setUnauthorizedHandler,
  type Role,
  type Session,
} from "./lib/api";
import type { View } from "./lib/view";
import AuthFlow from "./screens/AuthFlow";
import Dashboard from "./screens/Dashboard";
import KycScreen from "./screens/KycScreen";
import ApplyScreen from "./screens/ApplyScreen";
import { LoanDetail, LoansList } from "./screens/LoansScreen";
import KycQueue from "./screens/KycQueue";
import AdminLoans from "./screens/AdminLoans";
import AdminPricing from "./screens/AdminPricing";
import AdminReports from "./screens/AdminReports";
import AdminPayments from "./screens/AdminPayments";
import AdminPaymentSetup from "./screens/AdminPaymentSetup";
import { Icon, Logo, type IconName } from "./components/ui";
import { displayMobile } from "./lib/format";

type NavItem = { view: View; label: string; icon: IconName };

const NAV: Record<Role, NavItem[]> = {
  BORROWER: [
    { view: "home", label: "Home", icon: "home" },
    { view: "apply", label: "Apply", icon: "plus" },
    { view: "loans", label: "My loans", icon: "loans" },
    { view: "kyc", label: "Verify ID", icon: "shield" },
  ],
  REVIEWER: [
    { view: "home", label: "Home", icon: "home" },
    { view: "kyc-queue", label: "ID checks", icon: "shield" },
    { view: "admin-payments", label: "Payments", icon: "wallet" },
  ],
  ADMIN: [
    { view: "home", label: "Home", icon: "home" },
    { view: "kyc-queue", label: "ID checks", icon: "shield" },
    { view: "admin-loans", label: "Loans", icon: "loans" },
    { view: "admin-payments", label: "Payments", icon: "wallet" },
    { view: "admin-payment-setup", label: "Payment setup", icon: "bank" },
    { view: "admin-pricing", label: "Pricing", icon: "percent" },
    { view: "admin-reports", label: "Reports", icon: "chart" },
  ],
};

export default function App() {
  const [session, setSessionState] = useState<Session | null>(() =>
    loadSession()
  );
  const [view, setView] = useState<View>("home");
  const [loanId, setLoanId] = useState<string | null>(null);

  const setSession = useCallback((next: Session | null) => {
    saveSession(next);
    setSessionState(next);
    setView("home");
    setLoanId(null);
  }, []);

  // An expired or revoked token signs the user out from any screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, [setSession]);

  // Refresh the stored user (e.g. after KYC changes) without losing the token.
  const refreshUser = useCallback(async () => {
    if (!session) return;
    try {
      const { user } = await getMe(session.token);
      const next = { token: session.token, user };
      saveSession(next);
      setSessionState(next);
    } catch {
      /* a 401 is handled globally; other errors keep the current user */
    }
  }, [session]);

  // Pick up server-side changes (KYC approval, role changes) after a page reload.
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMe(token)
      .then(({ user }) => {
        if (cancelled) return;
        const next = { token, user };
        saveSession(next);
        setSessionState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!session) return <AuthFlow onSession={setSession} />;

  const { user } = session;
  const roleLabel = {
    BORROWER: "Borrower",
    REVIEWER: "Reviewer",
    ADMIN: "Administrator",
  }[user.role];

  const go = (next: View, id?: string) => {
    setView(next);
    setLoanId(id ?? null);
    window.scrollTo({ top: 0 });
  };

  // A view the current role cannot use falls back to home (the API enforces this too).
  const allowed =
    NAV[user.role].some((n) => n.view === view) ||
    (view === "loan" && user.role === "BORROWER");
  const current: View = allowed ? view : "home";
  const activeNav = current === "loan" ? "loans" : current;

  const isBorrower = user.role === "BORROWER";
  const items = NAV[user.role];

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => go("home")}
            aria-label="QuickLoan home"
            className="flex items-center gap-2"
          >
            <Logo />
          </button>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {items.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => go(n.view)}
                aria-current={activeNav === n.view ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeNav === n.view
                    ? "bg-brand-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">
                {displayMobile(user.mobileNumber)}
              </span>
              <span className="block text-xs text-slate-500">{roleLabel}</span>
            </span>
            <button
              type="button"
              onClick={() => setSession(null)}
              aria-label="Sign out"
              className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>

        {/* Staff have many sections: a swipeable row on phones. Borrowers get the bottom tab bar instead. */}
        {!isBorrower && (
          <nav
            className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 md:hidden"
            aria-label="Sections"
          >
            {items.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => go(n.view)}
                aria-current={activeNav === n.view ? "page" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  activeNav === n.view
                    ? "bg-brand-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main
        className={`mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 ${
          isBorrower ? "pb-28 md:pb-10" : ""
        }`}
      >
        {current === "home" && (
          <Dashboard token={session.token} user={user} go={go} />
        )}
        {current === "kyc" && (
          <KycScreen
            token={session.token}
            onChanged={() => void refreshUser()}
          />
        )}
        {current === "apply" && (
          <ApplyScreen token={session.token} user={user} go={go} />
        )}
        {current === "loans" && <LoansList token={session.token} go={go} />}
        {current === "loan" && loanId && (
          <LoanDetail token={session.token} id={loanId} go={go} />
        )}
        {current === "loan" && !loanId && (
          <LoansList token={session.token} go={go} />
        )}
        {current === "kyc-queue" && <KycQueue token={session.token} />}
        {current === "admin-loans" && <AdminLoans token={session.token} />}
        {current === "admin-payments" && (
          <AdminPayments token={session.token} />
        )}
        {current === "admin-payment-setup" && (
          <AdminPaymentSetup token={session.token} />
        )}
        {current === "admin-pricing" && <AdminPricing token={session.token} />}
        {current === "admin-reports" && <AdminReports token={session.token} />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-28 text-xs text-slate-400 sm:px-6 md:pb-10">
        Demo environment. No real funds are released and no real GCash, Maya,
        InstaPay or PESONet payouts are made.
      </footer>

      {isBorrower && (
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
          aria-label="Main"
        >
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {items.map((n) => {
              const on = activeNav === n.view;
              return (
                <li key={n.view}>
                  <button
                    type="button"
                    onClick={() => go(n.view)}
                    aria-current={on ? "page" : undefined}
                    className="flex w-full flex-col items-center gap-1 px-1 pb-1 pt-2.5"
                  >
                    <span
                      className={`grid h-8 w-14 place-items-center rounded-full transition ${
                        on ? "bg-brand-900 text-white" : "text-slate-500"
                      }`}
                    >
                      <Icon name={n.icon} className="size-5" />
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        on ? "text-brand-900" : "text-slate-500"
                      }`}
                    >
                      {n.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
