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

const NAV: Record<Role, { view: View; label: string }[]> = {
  BORROWER: [
    { view: "home", label: "Home" },
    { view: "apply", label: "Apply" },
    { view: "loans", label: "My loans" },
    { view: "kyc", label: "Verification" },
  ],
  REVIEWER: [
    { view: "home", label: "Home" },
    { view: "kyc-queue", label: "KYC queue" },
  ],
  ADMIN: [
    { view: "home", label: "Home" },
    { view: "kyc-queue", label: "KYC queue" },
    { view: "admin-loans", label: "Loans" },
    { view: "admin-pricing", label: "Pricing" },
    { view: "admin-reports", label: "Reports" },
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
    REVIEWER: "KYC reviewer",
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

  return (
    <div className="min-h-screen bg-[#f5f7f4]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-900 text-xl font-bold text-white">
              ₱
            </span>
            <span className="text-xl font-bold">PesoLoan</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              Demo
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            {NAV[user.role].map((n) => (
              <button
                key={n.view}
                onClick={() => go(n.view)}
                aria-current={activeNav === n.view ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  activeNav === n.view
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {roleLabel}
            </span>
            <button
              type="button"
              onClick={() => setSession(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
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
        {current === "admin-pricing" && <AdminPricing token={session.token} />}
        {current === "admin-reports" && <AdminReports token={session.token} />}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-400">
        Demo environment. No real funds are released and no real SMS, GCash,
        Maya, InstaPay or PESONet calls are made.
      </footer>
    </div>
  );
}
