/** Scrolled less than this from the top: the coach bar always shows. */
export const DOCK_TOP_ZONE = 24;
/** Closer than this to the end of the page: the bar shows (it fills the room kept for it). */
export const DOCK_END_ZONE = 48;
/** A move smaller than this (finger jitter, bounce) changes nothing. */
export const DOCK_SCROLL_STEP = 6;

/**
 * Whether Home's coach bar is hidden after the page scrolled from `prevY` to `y`: hidden while
 * scrolling down, back as soon as the page scrolls up, is near the top, or reaches its end (the room
 * kept under the last card is the bar's: hidden there, it was an empty gap). `toEnd`: distance left
 * to the end of the page (Infinity when unknown).
 */
export function dockHiddenAfterScroll(
  prevY: number,
  y: number,
  hidden: boolean,
  toEnd = Number.POSITIVE_INFINITY,
): boolean {
  if (y <= DOCK_TOP_ZONE) return false;
  if (toEnd <= DOCK_END_ZONE) return false;
  const dy = y - prevY;
  if (dy > DOCK_SCROLL_STEP) return true;
  if (dy < -DOCK_SCROLL_STEP) return false;
  return hidden;
}
