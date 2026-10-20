import { create } from 'zustand';
import type { AreaColorChoice } from './area-colors';
import { defaultTextScaleStep } from './theme';
import type { AccentName } from './tokens';

/**
 * Accessibility + appearance preferences. Read by every component through useTheme().
 * Persistence (local cache + user_settings sync) is wired in Phase 5.
 */
export type AppearanceState = {
  accent: AccentName;
  textScaleStep: number; // 1..5, 3 = default
  boldText: boolean;
  dotNumbers: boolean; // false = plain digits instead of Doto
  highContrast: boolean;
  reduceMotion: boolean;
  haptics: boolean;
  oneHandMode: boolean;
  spokenCountdown: boolean;
  /**
   * Area colours the user picked (DECISIONS 118), only the changed areas. Kept when the plan goes
   * back to Free; useTheme() shows them only for Supporter and Premium.
   */
  areaColors: AreaColorChoice;
};

export const defaultAppearance: AppearanceState = {
  accent: 'red',
  textScaleStep: defaultTextScaleStep,
  boldText: false,
  dotNumbers: true,
  highContrast: false,
  reduceMotion: false,
  haptics: true,
  oneHandMode: false,
  spokenCountdown: false,
  areaColors: {},
};

type Actions = {
  set: <K extends keyof AppearanceState>(key: K, value: AppearanceState[K]) => void;
  reset: () => void;
};

export const useAppearanceStore = create<AppearanceState & Actions>((set) => ({
  ...defaultAppearance,
  set: (key, value) => set({ [key]: value } as Partial<AppearanceState>),
  reset: () => set(defaultAppearance),
}));
