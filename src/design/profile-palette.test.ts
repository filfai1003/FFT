import { PROFILE_COLOURS } from '@/domain/community-look';
import { contrastRatio } from './contrast';
import { profilePalette } from './profile-palette';
import { palettes } from './tokens';

describe('profile colours (DECISIONS 119)', () => {
  it.each(['light', 'dark'] as const)('%s: every colour is drawn and readable', (mode) => {
    const th = palettes[mode];
    for (const c of PROFILE_COLOURS) {
      const s = profilePalette[mode][c];
      // The frame is a graphic: 3:1 on the card and the page.
      expect([c, contrastRatio(s.ring, th.surface) >= 3]).toEqual([c, true]);
      expect([c, contrastRatio(s.ring, th.bg) >= 3]).toEqual([c, true]);
      // The initial is text: 4.5:1 on the disc.
      expect([c, contrastRatio(s.ink, s.fill) >= 4.5]).toEqual([c, true]);
    }
  });
});
