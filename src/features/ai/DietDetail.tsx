import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { ImportedDiet } from '@/domain/plan-import';

/** A diet written out in full: mode, daily target and every meal. */
export function DietDetail({ diet }: { diet: ImportedDiet }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" muted>
        {diet.mode === 'tracking' ? t('ai.modeTracking') : t('ai.modeFixed')}
      </Text>
      <Text variant="body">
        {t('ai.dailyLine', { kcal: diet.kcal, p: diet.proteinG, c: diet.carbsG, f: diet.fatG })}
      </Text>
      {diet.meals.map((m) => (
        <View key={m.name} style={{ gap: 1 }}>
          <Text variant="bodyS">
            {m.isMain ? `${m.name} · ${t('fixed.mainBadge')}` : m.name}
            {diet.workoutAfter === m.name ? ` · ${t('ai.workoutAfter')}` : ''}
          </Text>
          <Text variant="label" muted>
            {t('diet.mealLine', {
              kcal: m.kcal,
              p: Math.round(m.proteinG),
              c: Math.round(m.carbsG),
              f: Math.round(m.fatG),
            })}
          </Text>
          {m.description ? (
            <Text variant="label" muted>
              {m.description}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
