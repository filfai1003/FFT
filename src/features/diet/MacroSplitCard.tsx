import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { parseDecimal } from '@/domain/numbers';
import { macrosFromPercents, macroKcal } from '@/domain/nutrition';

export type MacroPercents = { protein: number; carbs: number; fat: number };

type Props = {
  kcal: number;
  percents: MacroPercents;
  onChange: (next: MacroPercents) => void;
};

/**
 * The macro split of a calorie target, edited as percentages. Each percentage is independent
 * (the others never move) and the total may differ from 100%: grams just follow from the kcal.
 */
export function MacroSplitCard({ kcal, percents, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const macros = macrosFromPercents(kcal, percents);
  const total = percents.protein + percents.carbs + percents.fat;
  const rows = [
    ['protein', macros.proteinG, colors.macroSplit.protein, percents.protein],
    ['carbs', macros.carbsG, colors.macroSplit.carbs, percents.carbs],
    ['fat', macros.fatG, colors.macroSplit.fat, percents.fat],
  ] as const;

  return (
    <Card gap={12}>
      <Text semibold>{t('goals.macroSplit')}</Text>
      {/* One filled bar split in three (canvas "Goals"): always relative to the total. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('goals.splitLabel', {
          p: percents.protein,
          c: percents.carbs,
          f: percents.fat,
        })}
        style={{
          flexDirection: 'row',
          gap: 2,
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          backgroundColor: colors.dotOff,
        }}
      >
        {total > 0
          ? rows.map(([key, , color, pct]) =>
              pct > 0 ? <View key={key} style={{ flex: pct, backgroundColor: color }} /> : null,
            )
          : null}
      </View>
      {rows.map(([key, grams, color, pct]) => (
        <View
          key={key}
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderTopWidth: 1,
            borderColor: colors.divider,
          }}
        >
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
          <Text style={{ flex: 1 }}>{t(`diet.macro.${key}`)}</Text>
          <Text semibold numeric style={{ width: 60, textAlign: 'right' }}>
            {t('goals.gramsValue', { g: grams })}
          </Text>
          <View style={{ width: 84 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('goals.percentOf', { name: t(`diet.macro.${key}`) })}
              value={String(pct)}
              onChangeText={(v) =>
                // Each percentage is independent: the others never move.
                onChange({
                  ...percents,
                  [key]: Math.min(100, Math.max(0, Math.round(parseDecimal(v) ?? 0))),
                })
              }
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>
          <Text variant="bodyS" muted>
            {t('goals.percentSign')}
          </Text>
        </View>
      ))}
      <Text variant="bodyS" muted={total === 100} danger={total !== 100}>
        {total === 100
          ? t('goals.totalOk')
          : t('goals.totalOff', { pct: total, kcal: Math.round(macroKcal(macros)) })}
      </Text>
    </Card>
  );
}
