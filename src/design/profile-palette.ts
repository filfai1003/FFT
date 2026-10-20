import type { ProfileColour } from '@/domain/community-look';
import type { ThemeMode } from './tokens';

/**
 * The personal colours a Supporter / Premium member can give its avatar (DECISIONS 119). Not an
 * area colour (DECISIONS 107): a member's colour is the same for everyone who sees it, whatever
 * their own area colours. `ring` = the frame (≥ 3:1 on the card), `fill` = the avatar disc,
 * `ink` = the initial on it (≥ 4.5:1 on the fill). Tested in profile-palette.test.ts.
 */
export type ProfileSwatch = { ring: string; fill: string; ink: string };

export const profilePalette: Record<ThemeMode, Record<ProfileColour, ProfileSwatch>> = {
  light: {
    ember: { ring: '#C2410C', fill: '#FDE6D8', ink: '#8A2E08' },
    amber: { ring: '#A16207', fill: '#FBF0D0', ink: '#6B4105' },
    lime: { ring: '#4D7C0F', fill: '#E7F3D0', ink: '#355708' },
    forest: { ring: '#15803D', fill: '#DCF2E3', ink: '#0F5C2C' },
    ocean: { ring: '#0369A1', fill: '#DCEFFA', ink: '#024B73' },
    indigo: { ring: '#4338CA', fill: '#E3E1FA', ink: '#3227A0' },
    violet: { ring: '#7E22CE', fill: '#F1E2FB', ink: '#5B1696' },
    rose: { ring: '#BE123C', fill: '#FCE0E7', ink: '#8C0D2C' },
  },
  dark: {
    ember: { ring: '#F97342', fill: '#3A1D12', ink: '#FDA683' },
    amber: { ring: '#F2B53A', fill: '#352812', ink: '#F7CF7A' },
    lime: { ring: '#9BD13F', fill: '#23300F', ink: '#BFE57E' },
    forest: { ring: '#4ACB7B', fill: '#12301E', ink: '#86E0A8' },
    ocean: { ring: '#48B4EE', fill: '#102C3D', ink: '#8ED0F5' },
    indigo: { ring: '#8F87F5', fill: '#22204A', ink: '#BDB8FA' },
    violet: { ring: '#C17EF5', fill: '#2F1B42', ink: '#DBB4FA' },
    rose: { ring: '#F4708E', fill: '#3D1520', ink: '#F9A8BA' },
  },
};
