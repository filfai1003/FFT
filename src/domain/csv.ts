/** One CSV cell: quoted when it contains a comma, quote, or line break; formula-looking text is neutralised. */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  // A cell that starts with = + - @ would be run as a formula by spreadsheets.
  if (/^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s)))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows (objects) to a CSV text with a header, in the given column order. */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const lines = [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}
