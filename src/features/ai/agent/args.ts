/**
 * Checks of what the model sends to a tool. A wrong value throws a clear message: it goes back to
 * the model as the tool's error, so it can fix the call.
 */
export type Input = Record<string, unknown>;

export function optStr(input: Input, key: string, max = 200): string | undefined {
  const v = input[key];
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`"${key}" must be text`);
  if (v.length > max) throw new Error(`"${key}" is too long (max ${max} characters)`);
  return v.trim();
}

export function str(input: Input, key: string, max = 200): string {
  const v = optStr(input, key, max);
  if (!v) throw new Error(`"${key}" is required`);
  return v;
}

export function optNum(input: Input, key: string, min: number, max: number): number | undefined {
  const v = input[key];
  if (v == null || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
  if (n < min || n > max) throw new Error(`"${key}" must be between ${min} and ${max}`);
  return n;
}

export function num(input: Input, key: string, min: number, max: number): number {
  const v = optNum(input, key, min, max);
  if (v == null) throw new Error(`"${key}" is required`);
  return v;
}

/** A day as YYYY-MM-DD (a real calendar date); `fallback` when it is not given. */
export function day(input: Input, key: string, fallback: string): string {
  const v = optStr(input, key, 10);
  if (!v) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
    throw new Error(`"${key}" must be a date like 2026-10-13`);
  return v;
}

export const round = (n: number, places = 1) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
