import { useTranslation } from 'react-i18next';
import { HintCard } from '@/components/ui/HintCard';
import { useHint, useHintsStore, type HintId } from '@/features/today/hints-store';

const pages = {
  trainTips: 'train',
  workoutTips: 'workout',
  dietTips: 'diet',
  progressTips: 'progress',
  communityTips: 'community',
} as const;

export type FirstUseId = keyof typeof pages & HintId;

/**
 * The first visit of a page whose purpose is not obvious: a card with three short bullets and
 * "Got it", shown once per device (DECISIONS 124). Text in en.json under `help.first.<page>`.
 */
export function FirstUseHint({ id }: { id: FirstUseId }) {
  const { t } = useTranslation();
  const show = useHint(id);
  const dismiss = useHintsStore((s) => s.dismiss);
  if (!show) return null;
  const page = pages[id];
  return (
    <HintCard
      title={t(`help.first.${page}.title`)}
      bullets={[t(`help.first.${page}.b1`), t(`help.first.${page}.b2`), t(`help.first.${page}.b3`)]}
      doneLabel={t('help.gotIt')}
      onDismiss={() => dismiss(id)}
    />
  );
}
