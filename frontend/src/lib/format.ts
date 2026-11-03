const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/** "5000" -> "₱5,000.00" */
export function formatPeso(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? peso.format(n) : "—";
}

const pesoWhole = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/** "5000" -> "₱5,000" (limits and shortcuts, where centavos add noise) */
export function formatPesoWhole(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? pesoWhole.format(n) : "—";
}

/** "2026-11-03" or ISO timestamp -> "Nov 3, 2026" */
export function formatDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: value.length === 10 ? undefined : "Asia/Manila",
      });
}

/** "+639171234567" -> "0917 123 4567" */
export function displayMobile(e164: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Mirrors the backend rule: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX or +639XXXXXXXXX. */
export function isPhMobile(input: string): boolean {
  return /^(?:\+63|63|0)?9\d{9}$/.test(input.replace(/[\s()-]/g, ""));
}

/** Today's date in the Philippines as YYYY-MM-DD. */
export function todayInManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export function percent(value: string, digits = 2): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}
