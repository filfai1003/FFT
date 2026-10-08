/** How many of `total` dots are lit for `value` out of `goal` (capped, never negative). */
export function dotsOn(value: number, goal: number, total: number): number {
  if (!(goal > 0) || !(value > 0)) return 0;
  return Math.round(total * Math.min(value / goal, 1));
}

/**
 * Column heights (1..rows) for a dot column chart: the lowest value gets 1 dot, the highest
 * `rows` dots, so every column stays visible.
 */
export function columnLevels(values: readonly number[], lo: number, hi: number, rows: number) {
  return values.map((v) => {
    if (hi <= lo) return Math.max(1, Math.round(rows / 2));
    const level = Math.round(((v - lo) / (hi - lo)) * (rows - 1)) + 1;
    return Math.max(1, Math.min(rows, level));
  });
}
