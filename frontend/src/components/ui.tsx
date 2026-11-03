import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ------------------------------------------------------------------ icons */

const ICONS = {
  home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  plus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v8 M8 12h8",
  loans: "M7 3h8l4 4v14H7z M15 3v4h4 M10.5 12h5 M10.5 16h5",
  shield:
    "M12 3 4.5 6v6c0 4.4 3.1 7.8 7.5 9 4.4-1.2 7.5-4.6 7.5-9V6z M8.5 12l2.5 2.5 4.5-5",
  inbox: "M4 13l2-8h12l2 8 M4 13v6h16v-6 M4 13h5a3 3 0 0 0 6 0h5",
  wallet:
    "M3 7a2 2 0 0 1 2-2h12v4 M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2 M16 14.5h.01",
  sliders: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M13 5v4 M7 15v4",
  chart: "M5 20v-9 M12 20V4 M19 20v-6",
  percent: "M5 19 19 5 M7 7.5h.01 M17 16.5h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 4 2.5 20h19z M12 10v4.5 M12 17.5h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01",
  x: "M6 6l12 12 M18 6 6 18",
  chevron: "M9 5l7 7-7 7",
  logout: "M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c0-4 3.5-6 8-6s8 2 8 6",
  qr: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M14 19v1",
  bank: "M3 10 12 4l9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18",
  doc: "M7 3h8l4 4v14H7z M15 3v4h4 M10 13h6 M10 17h4",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name].split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------- brand */

export function Logo({
  light = false,
  size = "md",
}: {
  light?: boolean;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-11 text-2xl" : "size-9 text-xl";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`grid ${box} place-items-center rounded-xl bg-mango-400 font-display font-bold text-brand-950`}
      >
        ₱
      </span>
      <span
        className={`font-display text-xl font-bold tracking-tight ${
          light ? "text-white" : "text-brand-900"
        }`}
      >
        QuickLoan
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- forms */

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-semibold text-slate-800"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

type Variant = "primary" | "accent" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}) {
  const styles: Record<Variant, string> = {
    primary: "bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-950",
    accent:
      "bg-mango-400 text-brand-950 hover:bg-mango-300 active:bg-mango-500",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100",
    danger: "bg-red-700 text-white hover:bg-red-600 active:bg-red-800",
    ghost: "text-brand-800 hover:bg-brand-50 active:bg-brand-100",
  };
  const sizes = {
    sm: "min-h-9 px-3.5 text-sm",
    md: "min-h-11 px-5 text-sm",
    lg: "min-h-13 px-6 text-base",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${className}`}
    />
  );
}

/** Pill filter row (single choice). */
export function Chips<T extends string | undefined>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
            value === o.value
              ? "border-brand-900 bg-brand-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- feedback */

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success" | "info" | "warning";
  children: ReactNode;
}) {
  const styles = {
    error: ["border-red-200 bg-red-50 text-red-800", "alert", "text-red-600"],
    success: [
      "border-brand-200 bg-brand-50 text-brand-900",
      "check",
      "text-brand-600",
    ],
    info: ["border-sky-200 bg-sky-50 text-sky-900", "info", "text-sky-600"],
    warning: [
      "border-mango-300 bg-mango-100 text-amber-950",
      "alert",
      "text-mango-500",
    ],
  } as const;
  const [box, icon, iconColor] = styles[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${box}`}
    >
      <Icon name={icon} className={`mt-0.5 size-5 shrink-0 ${iconColor}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4 py-4">
      <div className="skeleton h-9 w-2/5" />
      <div className="skeleton h-28" />
      <div className="skeleton h-28" />
    </div>
  );
}

export function Empty({
  children,
  title,
  icon = "loans",
  action,
}: {
  children: ReactNode;
  title?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon name={icon} className="size-6" />
      </span>
      {title && (
        <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      )}
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- surfaces */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-slate-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,35,31,0.04)] sm:p-6">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-xl font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="money mt-1 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  onDark = false,
}: {
  value: number;
  max: number;
  label: string;
  onDark?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-3 w-full overflow-hidden rounded-full ${
        onDark ? "bg-white/20" : "bg-slate-100"
      }`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          onDark ? "bg-mango-400" : "bg-brand-600"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ resibo */

/** A printed-receipt card: every peso itemised, with a torn bottom edge. */
export function Resibo({
  title,
  tag,
  children,
  foot,
  className = "",
}: {
  title?: string;
  tag?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`drop-shadow-[0_10px_24px_rgba(16,35,31,0.12)] ${className}`}
    >
      <div className="rounded-t-2xl bg-white px-5 pb-3 pt-5 sm:px-6">
        {(title || tag) && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-display text-base font-semibold text-slate-600">
              {title}
            </p>
            {tag}
          </div>
        )}
        <div className="space-y-2.5">{children}</div>
        {foot && (
          <div className="resibo-dash mt-4 pt-3 text-xs leading-relaxed text-slate-500">
            {foot}
          </div>
        )}
      </div>
      <div className="resibo-edge" />
    </div>
  );
}

export function ResiboRow({
  label,
  value,
  sub,
  strong = false,
  muted = false,
  divider = false,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  muted?: boolean;
  divider?: boolean;
}) {
  return (
    <div className={divider ? "resibo-dash pt-3" : ""}>
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={
            strong
              ? "font-display text-lg font-semibold"
              : muted
              ? "text-sm text-slate-500"
              : "text-slate-700"
          }
        >
          {label}
        </span>
        <span
          className={`money shrink-0 text-right ${
            strong
              ? "font-display text-2xl font-bold text-brand-900"
              : muted
              ? "text-sm text-slate-500"
              : "font-semibold"
          }`}
        >
          {value}
        </span>
      </div>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ status */

const STATUS: Record<string, { label: string; box: string; dot: string }> = {
  SUBMITTED: {
    label: "In review",
    box: "bg-mango-100 text-amber-900",
    dot: "bg-mango-500",
  },
  PENDING: {
    label: "Pending",
    box: "bg-mango-100 text-amber-900",
    dot: "bg-mango-500",
  },
  PARTIAL: {
    label: "Partly paid",
    box: "bg-mango-100 text-amber-900",
    dot: "bg-mango-500",
  },
  UNPAID: {
    label: "Unpaid",
    box: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
  PAID: {
    label: "Paid",
    box: "bg-brand-100 text-brand-900",
    dot: "bg-brand-600",
  },
  OVERDUE: {
    label: "Overdue",
    box: "bg-red-100 text-red-800",
    dot: "bg-red-600",
  },
  APPROVED: {
    label: "Approved",
    box: "bg-brand-100 text-brand-900",
    dot: "bg-brand-600",
  },
  DISBURSED: {
    label: "Active",
    box: "bg-sky-100 text-sky-900",
    dot: "bg-sky-600",
  },
  REPAID: {
    label: "Fully paid",
    box: "bg-brand-100 text-brand-900",
    dot: "bg-brand-600",
  },
  REJECTED: {
    label: "Rejected",
    box: "bg-red-100 text-red-800",
    dot: "bg-red-600",
  },
  NOT_SUBMITTED: {
    label: "Not started",
    box: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? {
    label: status.replaceAll("_", " ").toLowerCase(),
    box: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.box}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
