/** Scrolled less than this from the top: the coach bar always shows. */
export const DOCK_TOP_ZONE = 24;
/** A move smaller than this (finger jitter, bounce) changes nothing. */
export const DOCK_SCROLL_STEP = 6;

/**
 * Whether Home's coach bar is hidden after the page scrolled from `prevY` to `y`: hidden while
 * scrolling down, back as soon as the page scrolls up or is near the top.
 */
export function dockHiddenAfterScroll(prevY: number, y: number, hidden: boolean): boolean {
  if (y <= DOCK_TOP_ZONE) return false;
  const dy = y - prevY;
  if (dy > DOCK_SCROLL_STEP) return true;
  if (dy < -DOCK_SCROLL_STEP) return false;
  return hidden;
}
