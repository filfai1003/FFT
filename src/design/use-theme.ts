import { useMemo } from 'react';
import { useAppearanceStore } from './appearance-store';
import { buildTheme, textScaleFor } from './theme';

export function useTheme() {
  const accent = useAppearanceStore((s) => s.accent);
  const highContrast = useAppearanceStore((s) => s.highContrast);
  const textScaleStep = useAppearanceStore((s) => s.textScaleStep);
  const boldText = useAppearanceStore((s) => s.boldText);
  const dotNumbers = useAppearanceStore((s) => s.dotNumbers);
  const reduceMotion = useAppearanceStore((s) => s.reduceMotion);
  const oneHandMode = useAppearanceStore((s) => s.oneHandMode);

  return useMemo(
    () => ({
      colors: buildTheme({ accent, highContrast }),
      textScale: textScaleFor(textScaleStep),
      boldText,
      dotNumbers,
      reduceMotion,
      oneHandMode,
    }),
    [accent, highContrast, textScaleStep, boldText, dotNumbers, reduceMotion, oneHandMode],
  );
}
