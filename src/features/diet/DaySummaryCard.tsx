import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import type { Macros } from '@/domain/diet';

type Props = {
  eaten: Macros;
  target: Macros;
  /** Right of the calories: "1360 left" or "Meals 2/4". */
  caption: string;
};

const macroKeys = ['protein', 'carbs', 'fat'] as const;

/** Calories left today (a filled bar) and the three macros as filling rings. */
export function DaySummaryCard({ eaten, target, caption }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const left = Math.max(0, Math.round(target.kcal - eaten.kcal));
  const over = eaten.kcal > target.kcal * 1.1;
  return (
    <Card gap={14}>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <View>
          <Text variant="bodyS" muted>
            {t('diet.leftToday')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="displayM" numeric>
              {left}
            </Text>
            <Text variant="body" muted>
              {t('common.kcal')}
            </Text>
          </View>
        </View>
        <Text variant="bodyS" muted numeric>
          {caption}
        </Text>
      </View>
      <DotBar
        total={Math.max(1, target.kcal)}
        on={eaten.kcal}
        size={12}
        color={over ? colors.warning : colors.dotOn}
        accessibilityLabel={t('diet.caloriesBar', {
          eaten: Math.round(eaten.kcal),
          target: Math.round(target.kcal),
        })}
      />
      <Text variant="label" muted numeric>
        {t('diet.eatenOfTarget', {
          eaten: Math.round(eaten.kcal),
          target: Math.round(target.kcal),
        })}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          borderTopWidth: 1,
          borderColor: colors.divider,
          paddingTop: 14,
        }}
      >
        {macroKeys.map((key) => (
          <View key={key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Gauge
              value={target[key] > 0 ? eaten[key] / target[key] : 0}
              size={40}
              stroke={5}
              color={colors.macroSplit[key]}
              track={colors.macroSoft[key]}
              accessibilityLabel={t(`diet.macro.${key}`)}
            />
            <View style={{ flexShrink: 1 }}>
              <Text variant="body" numeric style={{ fontWeight: '600' }}>
                {`${Math.round(eaten[key])} g`}
              </Text>
              <Text variant="label" muted numeric>
                {t('diet.ofGrams', { g: Math.round(target[key]), name: t(`diet.macro.${key}`) })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
