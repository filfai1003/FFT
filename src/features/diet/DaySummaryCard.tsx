import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Text } from '@/components/ui/Text';
import { dotsOn } from '@/domain/dots';
import type { Macros } from '@/domain/diet';

type Props = {
  eaten: Macros;
  target: Macros;
  /** Right of the calories: "1360 LEFT" or "MEALS 2/4". */
  caption: string;
};

const macroRows = [
  ['protein', 'PROT'],
  ['carbs', 'CARB'],
  ['fat', 'FAT'],
] as const;

/** Calories eaten of the target, the segmented bar and the three macro bars. */
export function DaySummaryCard({ eaten, target, caption }: Props) {
  const { t } = useTranslation();
  return (
    <Card gap={10} style={{ paddingVertical: 14, paddingHorizontal: 18 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="displayM" numeric>
            {Math.round(eaten.kcal)}
          </Text>
          <Text variant="label" muted>
            {t('diet.ofTarget', { kcal: Math.round(target.kcal) })}
          </Text>
        </View>
        <Text variant="label" muted>
          {caption}
        </Text>
      </View>
      <DotBar
        shape="segment"
        total={30}
        on={dotsOn(eaten.kcal, target.kcal, 30)}
        size={6}
        gap={3}
        accessibilityLabel={t('diet.caloriesBar', {
          eaten: Math.round(eaten.kcal),
          target: Math.round(target.kcal),
        })}
      />
      <View style={{ flexDirection: 'row', gap: 14, paddingTop: 10 }}>
        {macroRows.map(([key, label]) => (
          <View key={key} style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" muted>
                {label}
              </Text>
              <Text variant="label">{`${Math.round(eaten[key])}/${Math.round(target[key])}`}</Text>
            </View>
            <DotBar
              shape="segment"
              total={10}
              on={dotsOn(eaten[key], target[key], 10)}
              size={5}
              gap={2}
              accessibilityLabel={t(`diet.macro.${key}`)}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}
