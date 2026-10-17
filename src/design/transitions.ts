import { useMemo } from 'react';
import { useTheme } from './use-theme';

/**
 * Page transitions (DECISIONS 69), one place for the whole app so every move feels the same:
 * - push: a page opened from another slides in from the right, and back out.
 * - modal: forms and pickers rise from the bottom.
 * - fade: switching context without a direction (sign in, onboarding, the root of the app).
 * - tabs: the main pages slide sideways in their order (see features/navigation/SwipeTabs).
 * With "reduce motion" (the app's setting or the phone's) nothing moves: a short fade instead,
 * or no animation at all for the tabs.
 */
export type TransitionKind = 'push' | 'modal' | 'fade';

/** The native-stack animations this app uses. */
export type StackAnimation = 'slide_from_right' | 'slide_from_bottom' | 'fade' | 'none';

export type StackTransition = { animation: StackAnimation; animationDuration: number };

export const motion = {
  push: 280,
  modal: 260,
  fade: 160,
  reducedFade: 120,
  /** A tab change made with a tap (a swipe follows the finger and then settles). */
  tab: 260,
} as const;

export function stackTransition(kind: TransitionKind, reduceMotion: boolean): StackTransition {
  if (reduceMotion) return { animation: 'fade', animationDuration: motion.reducedFade };
  switch (kind) {
    case 'push':
      return { animation: 'slide_from_right', animationDuration: motion.push };
    case 'modal':
      return { animation: 'slide_from_bottom', animationDuration: motion.modal };
    case 'fade':
      return { animation: 'fade', animationDuration: motion.fade };
  }
}

/** How long a tapped tab change slides (0 = jump straight there). */
export function tabDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : motion.tab;
}

/** Screen options of a Stack: theme background, no header, the transition of `kind`. */
export function useStackOptions(kind: TransitionKind = 'push') {
  const { colors, reduceMotion } = useTheme();
  return useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      ...stackTransition(kind, reduceMotion),
    }),
    [colors.bg, kind, reduceMotion],
  );
}

/** Options for one screen of a stack whose transition differs from the stack's (e.g. a modal). */
export function useTransition(kind: TransitionKind) {
  const { reduceMotion } = useTheme();
  return useMemo(() => stackTransition(kind, reduceMotion), [kind, reduceMotion]);
}
