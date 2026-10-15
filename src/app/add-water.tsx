import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { useAddWater, useRemoveWater } from '@/features/diet/log';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useToastStore } from '@/lib/toast-store';

/**
 * fft://add-water, from the Water widget: adds one glass to today, then shows Home with UNDO.
 */
export default function AddWater() {
  const { t } = useTranslation();
  const router = useRouter();
  const today = useToday();
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    void (async () => {
      router.replace('/');
      const id = await addWater.mutateAsync({ day: today, ml: glassMl }).catch(() => null);
      if (!id) return;
      showToast({
        message: t('widgets.glassAdded', { ml: glassMl }),
        actionLabel: t('common.undo'),
        onAction: () => removeWater.mutate(id),
      });
    })();
    // Once per tap on the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Screen>{null}</Screen>;
}
