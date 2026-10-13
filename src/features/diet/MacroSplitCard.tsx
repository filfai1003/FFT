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
  // The dot bar always shows the split relative to the total, whatever the total is.
  const dots = (pct: number) => (total > 0 ? Math.round((pct / total) * 30) : 0);
  const rows = [
    ['protein', macros.proteinG, colors.macroSplit.protein, percents.protein],
    ['carbs', macros.carbsG, colors.macroSplit.carbs, percents.carbs],
    ['fat', macros.fatG, colors.macroSplit.fat, percents.fat],
  ] as const;
  const a = dots(percents.protein);
  const b = a + dots(percents.carbs);

  return (
    <Card gap={12}>
      <Text variant="label" muted>
        {t('goals.macroSplit')}
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('goals.splitLabel', {
          p: percents.protein,
          c: percents.carbs,
          f: percents.fat,
        })}
        style={{ flexDirection: 'row', gap: 3 }}
      >
        {Array.from({ length: 30 }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor:
                i < a
                  ? colors.macroSplit.protein
                  : i < b
                    ? colors.macroSplit.carbs
                    : colors.macroSplit.fat,
            }}
          />
        ))}
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
            borderColor: colors.borderDecorative,
          }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ flex: 1 }}>{t(`diet.macro.${key}`)}</Text>
          <Text variant="label" muted style={{ width: 52, textAlign: 'right' }}>
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
          <Text variant="label" muted>
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
