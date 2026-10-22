import type { EffectiveWater } from '@/domain/hydration';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** ml as litres with up to two decimals: 2450 → "2.45", 2500 → "2.5", 3000 → "3". */
export function litres(ml: number): string {
  return String(Math.round(ml / 10) / 100);
}

/**
 * The user's own water target, step by step, for the "What's this?" sheet (DECISIONS 127):
 * "Base 70 kg × 35 ml = 2.45 L", "Training today +0.5 L", "Your target 2.95 L".
 */
export function waterTargetLines(t: Translate, target: EffectiveWater): string[] {
  const a = target.auto;
  const lines: string[] = [];
  if (!target.automatic) {
    lines.push(t('waterTarget.manual', { l: litres(target.ml), auto: litres(a.ml) }));
    return lines;
  }
  const b = a.base;
  if (b.kind === 'weight') {
    lines.push(
      b.countedKg != null
        ? t('waterTarget.baseCounted', {
            kg: b.countedKg,
            weight: b.weightKg,
            perKg: b.mlPerKg,
            l: litres(b.ml),
          })
        : t('waterTarget.base', { kg: b.weightKg, perKg: b.mlPerKg, l: litres(b.ml) }),
    );
    if (a.floorApplied) lines.push(t('waterTarget.floor', { l: litres(a.floorMl) }));
  } else if (b.kind === 'floor') {
    lines.push(t('waterTarget.baseFloor', { l: litres(b.ml) }));
  } else {
    lines.push(t('waterTarget.baseDefault', { l: litres(b.ml) }));
  }
  if (a.trainingMl > 0)
    lines.push(
      a.workoutMinutes != null
        ? t('waterTarget.trainingMinutes', {
            min: Math.round(a.workoutMinutes),
            l: litres(a.trainingMl),
          })
        : t('waterTarget.training', { l: litres(a.trainingMl) }),
    );
  if (a.clamped === 'max') lines.push(t('waterTarget.clampedMax', { l: litres(a.ml) }));
  if (a.clamped === 'min') lines.push(t('waterTarget.clampedMin', { l: litres(a.ml) }));
  lines.push(t('waterTarget.total', { l: litres(a.ml) }));
  const missing = (
    [
      ['weight', a.used.weight],
      ['sex', a.used.sex],
      ['age', a.used.age || !a.used.weight],
      ['height', a.used.height || !a.used.weight],
    ] as const
  )
    .filter(([, used]) => !used)
    .map(([k]) => t(`waterTarget.detail.${k}`));
  if (missing.length > 0) lines.push(t('waterTarget.missing', { list: missing.join(', ') }));
  return lines;
}
