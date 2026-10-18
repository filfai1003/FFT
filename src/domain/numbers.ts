export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** value + delta, clamped, without floating point noise (0.1 + 0.2 -> 0.3). */
export function stepValue(value: number, delta: number, min: number, max: number): number {
  const places = Math.max(decimals(value), decimals(delta));
  return clamp(Number((value + delta).toFixed(places)), min, max);
}

/** Parses user input like "12", "12.5" or "12,5". Returns null when it is not a number. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || !/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** A whole number with thousands separators, as the design writes them: 2700 -> "2,700". */
export function formatInt(n: number): string {
  const r = Math.round(n);
  const sign = r < 0 ? '-' : '';
  return sign + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
