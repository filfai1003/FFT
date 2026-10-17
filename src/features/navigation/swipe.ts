/**
 * Pure logic of the horizontal swipes (between tabs, between exercises): DECISIONS 70.
 * Plain functions marked as worklets so the gesture runs them on the UI thread; tested in Jest.
 */

/** Touches starting this close to a side are left to the system back gesture (Android). */
export const EDGE = 28;
/** Horizontal travel before a swipe starts. */
export const ACTIVATE_X = 14;
/** Vertical travel that hands the touch to the scroll view instead. */
export const FAIL_Y = 12;

export type SwipeIntent = 'wait' | 'activate' | 'fail';

/**
 * Decides, while the finger moves, whether this touch is a page swipe: clearly horizontal (at
 * least twice as much across as down), not from a screen edge, not after a vertical start.
 */
export function swipeIntent(dx: number, dy: number, startX: number, width: number): SwipeIntent {
  'worklet';
  if (width <= 0) return 'fail';
  if (startX < EDGE || startX > width - EDGE) return 'fail';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > FAIL_Y && ay * 2 > ax) return 'fail';
  if (ax >= ACTIVATE_X && ax > ay * 2) return 'activate';
  return 'wait';
}

/** The page position under the finger: one page per screen width, resisting past the ends. */
export function dragPosition(from: number, dx: number, width: number, count: number): number {
  'worklet';
  if (width <= 0 || count <= 0) return from;
  const raw = from - dx / width;
  const max = count - 1;
  // Past the first or last page it moves a third as much (a soft wall, not a hard stop).
  if (raw < 0) return Math.max(-0.25, raw / 3);
  if (raw > max) return Math.min(max + 0.25, max + (raw - max) / 3);
  return raw;
}

/** Fling speed (px/s) that turns the page even when the finger moved less than half a page. */
export const FLING = 500;

/** The page a released swipe settles on: past half a page, or a quick fling, moves one page. */
export function settlePage(
  from: number,
  dx: number,
  vx: number,
  width: number,
  count: number,
): number {
  'worklet';
  if (width <= 0 || count <= 0) return from;
  let to = from;
  if (dx < -width / 2 || (vx < -FLING && dx < 0)) to = from + 1;
  else if (dx > width / 2 || (vx > FLING && dx > 0)) to = from - 1;
  return Math.min(count - 1, Math.max(0, to));
}

/**
 * Where the tab bar's pill sits for a page position: the bar's slots are the tabs with the round
 * "+" action in the middle (not a page), so pages after the middle skip one slot.
 */
export function indicatorSlot(position: number, pageCount: number, hasAction: boolean): number {
  'worklet';
  if (!hasAction) return position;
  const half = Math.ceil(pageCount / 2);
  // Between the last page before the action and the first after it, the pill jumps the action.
  if (position <= half - 1) return position;
  if (position >= half) return position + 1;
  return half - 1 + (position - (half - 1)) * 2;
}

/** How much a tab is "the current one" (1) for a page position, fading to 0 one page away. */
export function tabFocus(position: number, page: number): number {
  'worklet';
  return Math.max(0, 1 - Math.abs(position - page));
}
