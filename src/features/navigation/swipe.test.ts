import {
  ACTIVATE_X,
  EDGE,
  dragPosition,
  indicatorSlot,
  settlePage,
  swipeIntent,
  tabFocus,
} from './swipe';
import { lockTabSwipe, unlockTabSwipe, useTabSwipeLock } from './swipe-lock';

const W = 400;

describe('swipeIntent', () => {
  it('starts on a clearly horizontal move', () => {
    expect(swipeIntent(ACTIVATE_X, 2, 200, W)).toBe('activate');
    expect(swipeIntent(-30, 5, 200, W)).toBe('activate');
  });

  it('waits while the finger has barely moved', () => {
    expect(swipeIntent(5, 3, 200, W)).toBe('wait');
  });

  it('leaves vertical scrolling alone', () => {
    expect(swipeIntent(4, 20, 200, W)).toBe('fail');
    // Diagonal: not twice as much across as down.
    expect(swipeIntent(20, 14, 200, W)).toBe('fail');
  });

  it('leaves the screen edges to the system back gesture', () => {
    expect(swipeIntent(40, 0, EDGE - 1, W)).toBe('fail');
    expect(swipeIntent(-40, 0, W - EDGE + 1, W)).toBe('fail');
    expect(swipeIntent(40, 0, EDGE + 1, W)).toBe('activate');
  });

  it('does nothing before the width is known', () => {
    expect(swipeIntent(40, 0, 200, 0)).toBe('fail');
  });
});

describe('dragPosition', () => {
  it('follows the finger one page per width', () => {
    expect(dragPosition(1, -200, W, 4)).toBeCloseTo(1.5);
    expect(dragPosition(1, 100, W, 4)).toBeCloseTo(0.75);
  });

  it('resists past the first and the last page', () => {
    expect(dragPosition(0, 300, W, 4)).toBeCloseTo(-0.25);
    expect(dragPosition(0, 120, W, 4)).toBeCloseTo(-0.1);
    expect(dragPosition(3, -120, W, 4)).toBeCloseTo(3.1);
  });
});

describe('settlePage', () => {
  it('turns the page past half a width or on a fling', () => {
    expect(settlePage(1, -210, 0, W, 4)).toBe(2);
    expect(settlePage(1, -100, 0, W, 4)).toBe(1);
    expect(settlePage(1, -60, -900, W, 4)).toBe(2);
    expect(settlePage(1, 60, 900, W, 4)).toBe(0);
  });

  it('a fling against the drag does not turn it', () => {
    expect(settlePage(1, -60, 900, W, 4)).toBe(1);
  });

  it('stays within the pages', () => {
    expect(settlePage(0, 300, 1000, W, 4)).toBe(0);
    expect(settlePage(3, -300, -1000, W, 4)).toBe(3);
  });
});

describe('tab bar indicator', () => {
  it('skips the "+" slot in the middle', () => {
    expect([0, 1, 2, 3].map((p) => indicatorSlot(p, 4, true))).toEqual([0, 1, 3, 4]);
    expect(indicatorSlot(1.5, 4, true)).toBe(2);
    expect(indicatorSlot(0.5, 4, true)).toBe(0.5);
    expect(indicatorSlot(2, 4, false)).toBe(2);
  });

  it('the current tab is fully focused, a page away not at all', () => {
    expect(tabFocus(2, 2)).toBe(1);
    expect(tabFocus(2.5, 2)).toBe(0.5);
    expect(tabFocus(3, 1)).toBe(0);
  });
});

describe('swipe lock', () => {
  it('any reason turns the swipe off', () => {
    lockTabSwipe('edit');
    lockTabSwipe('edit');
    lockTabSwipe('other');
    expect(useTabSwipeLock.getState().reasons).toEqual(['edit', 'other']);
    unlockTabSwipe('edit');
    unlockTabSwipe('other');
    expect(useTabSwipeLock.getState().reasons).toEqual([]);
  });
});
