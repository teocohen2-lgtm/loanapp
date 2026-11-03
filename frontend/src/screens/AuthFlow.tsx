import { useState } from "react";
import type { FormEvent } from "react";
import {
  errorMessage,
  forgotPassword,
  login,
  register,
  resendOtp,
  resetPassword,
  verifyOtp,
  type Session,
} from "../lib/api";
import { isPhMobile } from "../lib/format";
import { inputCls } from "../lib/styles";
// import { Alert, Button, Field } from "../components/ui";
import {
  Alert,
  Button,
  Field,
  Icon,
  Logo,
  Resibo,
  ResiboRow,
} from "../components/ui";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

export default function AuthFlow({
  onSession,
}: {
  onSession: (s: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devOtp, setDevOtp] = useState("");

  function go(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setCode("");
    if (next === "login" || next === "register") setDevOtp("");
  }

  /** Runs an async action with shared busy/error handling. */
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function requireMobile(): boolean {
    if (isPhMobile(mobile)) return true;
    setError(
      "Enter a valid Philippine mobile number, e.g. 09171234567 or +63 917 123 4567."
    );
    return false;
  }

  function checkPassword(): boolean {
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setError(
        "Password must be at least 8 characters and include a letter and a number."
      );
      return false;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return false;
    }
    return true;
  }

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!requireMobile()) return;
    void run(async () => {
      try {
        onSession(await login(mobile.trim(), password));
        setPassword("");
      } catch (err) {
        // Registered but never verified: send them straight to the code screen.
        if (
          err instanceof Error &&
          "code" in err &&
          err.code === "MOBILE_NOT_VERIFIED"
        ) {
          const r = await resendOtp(mobile.trim()).catch(() => null);
          setDevOtp(r?.devOtp ?? "");
          setMode("verify");
          setNotice("Please verify your mobile number to continue.");
          return;
        }
        throw err;
      }
    });
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!requireMobile() || !checkPassword()) return;
    if (!consent) {
      setError("Please accept the Terms and Data Privacy consent to continue.");
      return;
    }
    void run(async () => {
      const r = await register({
        mobileNumber: mobile.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setDevOtp(r.devOtp ?? "");
      setMode("verify");
      setNotice("We sent a 6-digit code to your mobile number.");
    });
  };

  const submitVerify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      onSession(await verifyOtp(mobile.trim(), code.trim()));
    });
  };

  const resend = () =>
    void run(async () => {
      const r = await resendOtp(mobile.trim());
      setDevOtp(r.devOtp ?? "");
      setNotice(
        "If a code was due, a new one has been sent. You can request another after one minute."
      );
    });

  const submitForgot = (e: FormEvent) => {
    e.preventDefault();
    if (!requireMobile()) return;
    void run(async () => {
      const r = await forgotPassword(mobile.trim());
      setDevOtp(r.devOtp ?? "");
      setMode("reset");
      setNotice("If that number is registered, a reset code was sent.");
    });
  };

  const submitReset = (e: FormEvent) => {
    e.preventDefault();
    if (!checkPassword()) return;
    void run(async () => {
      await resetPassword(mobile.trim(), code.trim(), password);
      setPassword("");
      setConfirm("");
      setDevOtp("");
      setMode("login");
      setCode("");
      setNotice("Password updated. Sign in with your new password.");
    });
  };

  const titles: Record<Mode, [string, string]> = {
    login: ["Welcome back", "Sign in with your mobile number."],
    register: [
      "Create your account",
      "Use a Philippine mobile number that can receive an SMS code.",
    ],
    verify: [
      "Verify your number",
      `Enter the 6-digit code sent to ${mobile || "your mobile number"}.`,
    ],
    forgot: [
      "Reset your password",
      "We will text a code to your registered mobile number.",
    ],
    reset: [
      "Choose a new password",
      "Enter the code we sent and your new password.",
    ],
  };

  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[1.05fr_1fr]">
      <section className="hidden flex-col gap-8 bg-brand-950 px-12 py-10 text-white lg:flex xl:px-14">
        <Logo light size="lg" />

        <div className="max-w-xl">
          <h1 className="text-5xl font-bold leading-[1.05] text-white">
            See every peso before you borrow.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-brand-100/80">
            Borrow ₱1,000 to ₱50,000 for 1 to 12 months. Your quote shows what
            you receive, what you pay each month and the total, before you
            apply.
          </p>

          <div className="resibo-print mt-7 max-w-sm text-slate-900">
            <Resibo
              title="Example quote"
              tag={
                <span className="rounded-full bg-mango-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                  Example
                </span>
              }
              foot="Example only, at 3% a month with a ₱50 fee. Your real rate and fees are shown before you apply."
            >
              <ResiboRow label="Loan amount" value="₱5,000.00" />
              <ResiboRow label="Processing fee" value="−₱50.00" muted />
              <ResiboRow label="You receive" value="₱4,950.00" strong divider />
              <ResiboRow
                label="Monthly payment"
                value="₱1,767.65"
                sub="for 3 months, last one ₱1,767.66"
              />
              <ResiboRow
                label="Total you pay back"
                value="₱5,302.96"
                strong
                divider
              />
            </Resibo>
          </div>
        </div>

        <ul className="mt-auto flex flex-wrap gap-x-8 gap-y-3 text-sm text-brand-100/80 [@media(max-height:899px)]:hidden">
          <li className="flex items-center gap-2">
            <Icon name="qr" className="size-5 text-mango-400" />
            Pay by GCash, Maya or bank transfer
          </li>
          <li className="flex items-center gap-2">
            <Icon name="shield" className="size-5 text-mango-400" />
            Your ID is checked first
          </li>
          <li className="flex items-center gap-2">
            <Icon name="check" className="size-5 text-mango-400" />
            Payments confirmed by our team
          </li>
        </ul>
      </section>

      <section className="flex flex-col">
        <div className="rounded-b-3xl bg-brand-950 px-5 pb-8 pt-6 text-white lg:hidden">
          <Logo light />
          <p className="mt-6 font-display text-3xl font-bold leading-tight">
            See every peso before you borrow.
          </p>
          <p className="mt-2 text-sm text-brand-100/80">
            Clear quotes. Pay by GCash, Maya or bank transfer.
          </p>
        </div>

        <div className="flex flex-1 items-start justify-center px-5 py-8 sm:px-6 lg:items-center lg:py-16">
          <div className="w-full max-w-md">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {titles[mode][0]}
            </h2>
            <p className="mt-3 text-slate-500">{titles[mode][1]}</p>

            <div className="mt-6 space-y-3">
              {notice && <Alert kind="success">{notice}</Alert>}
              {devOtp && (
                <Alert kind="info">
                  Development mode: no SMS is sent. Your code is{" "}
                  <strong className="font-mono">{devOtp}</strong>.
                </Alert>
              )}
            </div>

            {mode === "login" && (
              <form onSubmit={submitLogin} className="mt-6 space-y-5">
                <MobileField
                  value={mobile}
                  onChange={setMobile}
                  disabled={busy}
                />
                <Field label="Password" htmlFor="password">
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                {error && <Alert>{error}</Alert>}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="w-full"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
                <div className="flex justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => go("forgot")}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => go("register")}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Create account
                  </button>
                </div>
              </form>
            )}

            {mode === "register" && (
              <form onSubmit={submitRegister} className="mt-6 space-y-5">
                <MobileField
                  value={mobile}
                  onChange={setMobile}
                  disabled={busy}
                />
                <Field label="Email (optional)" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Password"
                  htmlFor="newPassword"
                  hint="At least 8 characters with a letter and a number."
                >
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                <Field label="Confirm password" htmlFor="confirm">
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                <label className="flex items-start gap-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 size-4 accent-brand-800"
                  />
                  <span>
                    I agree to the Terms of Use and consent to the collection
                    and processing of my personal information under the Data
                    Privacy Act of 2012 (RA 10173).
                  </span>
                </label>
                {error && <Alert>{error}</Alert>}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="w-full"
                >
                  {busy ? "Creating account…" : "Create account"}
                </Button>
                <p className="text-center text-sm">
                  Already registered?{" "}
                  <button
                    type="button"
                    onClick={() => go("login")}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}

            {mode === "verify" && (
              <form onSubmit={submitVerify} className="mt-6 space-y-5">
                <CodeField value={code} onChange={setCode} disabled={busy} />
                {error && <Alert>{error}</Alert>}
                <Button type="submit" disabled={busy} className="w-full py-3.5">
                  {busy ? "Verifying…" : "Verify and continue"}
                </Button>
                <div className="flex justify-between text-sm">
                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    onClick={() => go("login")}
                    className="font-semibold text-slate-600 hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={submitForgot} className="mt-6 space-y-5">
                <MobileField
                  value={mobile}
                  onChange={setMobile}
                  disabled={busy}
                />
                {error && <Alert>{error}</Alert>}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="w-full"
                >
                  {busy ? "Sending…" : "Send reset code"}
                </Button>
                <p className="text-center text-sm">
                  <button
                    type="button"
                    onClick={() => go("login")}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Back to sign in
                  </button>
                </p>
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={submitReset} className="mt-6 space-y-5">
                <CodeField value={code} onChange={setCode} disabled={busy} />
                <Field
                  label="New password"
                  htmlFor="resetPassword"
                  hint="At least 8 characters with a letter and a number."
                >
                  <input
                    id="resetPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="resetConfirm">
                  <input
                    id="resetConfirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  />
                </Field>
                {error && <Alert>{error}</Alert>}
                <Button type="submit" disabled={busy} className="w-full py-3.5">
                  {busy ? "Updating…" : "Update password"}
                </Button>
                <p className="text-center text-sm">
                  <button
                    type="button"
                    onClick={() => go("login")}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    Back to sign in
                  </button>
                </p>
              </form>
            )}

            <p className="mt-8 text-center text-xs text-slate-400">
              environment. No real funds are released.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function MobileField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Field
      label="Philippine mobile number"
      htmlFor="mobileNumber"
      hint="09XXXXXXXXX or +63 9XX XXX XXXX"
    >
      <input
        id="mobileNumber"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        placeholder="09XXXXXXXXX"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={25}
        disabled={disabled}
        className={inputCls}
      />
    </Field>
  );
}

function CodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Field label="6-digit code" htmlFor="code">
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        required
        disabled={disabled}
        className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
      />
    </Field>
  );
}
