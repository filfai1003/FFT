/** A card's place in the Today grid, relative to the grid. */
export type CardRect = { id: string; x: number; y: number; w: number; h: number };

/**
 * The card a dragged card is dropped on: the one under the dragged card's centre, else the one
 * whose centre is nearest. Returns the dragged card's own id when it stays in place.
 */
export function dropTarget(
  rects: readonly CardRect[],
  draggedId: string,
  cx: number,
  cy: number,
): string {
  'worklet';
  let best = draggedId;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const r of rects) {
    if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return r.id;
    const dx = r.x + r.w / 2 - cx;
    const dy = r.y + r.h / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < bestDistance) {
      bestDistance = d;
      best = r.id;
    }
  }
  return best;
}
