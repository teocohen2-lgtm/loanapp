/** Accepts 09171234567, 9171234567, 639171234567, +63 917 123 4567. Returns null if invalid. */
export function normalizePhMobile(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, "");
  const m = /^(?:\+63|63|0)?(9\d{9})$/.exec(cleaned);
  return m ? `+63${m[1]}` : null;
}
