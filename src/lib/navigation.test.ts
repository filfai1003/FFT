import { parentPath } from './navigation';

describe('parentPath', () => {
  it('goes up one level, to the nearest page', () => {
    expect(parentPath('/progress/calendar')).toBe('/progress');
    expect(parentPath('/progress/history/abc')).toBe('/progress');
    expect(parentPath('/train/plan/abc')).toBe('/train');
    expect(parentPath('/profile/privacy')).toBe('/profile');
    expect(parentPath('/profile/settings')).toBe('/profile');
    expect(parentPath('/exercise-picker')).toBe('/(tabs)');
  });
});
