/**
 * Minimal RFC 4180 CSV writer.
 * - Quotes cells containing commas, quotes or line breaks.
 * - Neutralizes spreadsheet formula injection: text starting with = + - @ (or a tab/CR)
 *   is prefixed with a single quote so Excel/Sheets show it as text, not a formula.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);

  let text = value instanceof Date ? value.toISOString() : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Returns the CSV text with a UTF-8 BOM so Excel reads non-ASCII names correctly. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
