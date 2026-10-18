import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import type { Macros } from '@/domain/diet';
import { formatInt } from '@/domain/numbers';

type Props = {
  eaten: Macros;
  /** Null = no target (DECISIONS 104): what was eaten only, no "left", bar or rings. */
  target: Macros | null;
  /** Right of the calories: "1360 left" or "Meals 2/4". */
  caption?: string;
  /** Without a target: a quiet "Set a target" link. */
  onSetTarget?: () => void;
};

const macroKeys = ['protein', 'carbs', 'fat'] as const;

/** Calories left today (a filled bar) and the three macros as filling rings. */
export function DaySummaryCard({ eaten, target, caption, onSetTarget }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!target) return <EatenCard eaten={eaten} caption={caption} onSetTarget={onSetTarget} />;
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
              {formatInt(left)}
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
        color={over ? colors.danger : colors.nutrition}
        track={colors.nutritionSoft}
        accessibilityLabel={t('diet.caloriesBar', {
          eaten: Math.round(eaten.kcal),
          target: Math.round(target.kcal),
        })}
      />
      <Text variant="bodyS" muted numeric>
        {t('diet.eatenOfTarget', {
          eaten: formatInt(eaten.kcal),
          target: formatInt(target.kcal),
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
              <Text variant="bodyS" muted numeric>
                {t('diet.ofGrams', { g: Math.round(target[key]), name: t(`diet.macro.${key}`) })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** No target: calories and macros eaten, nothing to fill. */
function EatenCard({ eaten, caption, onSetTarget }: Omit<Props, 'target'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card gap={14}>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <View>
          <Text variant="bodyS" muted>
            {t('diet.eatenDay')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="displayM" numeric>
              {formatInt(eaten.kcal)}
            </Text>
            <Text variant="body" muted>
              {t('common.kcal')}
            </Text>
          </View>
        </View>
        {caption ? (
          <Text variant="bodyS" muted numeric>
            {caption}
          </Text>
        ) : null}
      </View>
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
          <View key={key} style={{ flex: 1 }}>
            <Text variant="body" numeric style={{ fontWeight: '600' }}>
              {`${Math.round(eaten[key])} g`}
            </Text>
            <Text variant="bodyS" muted>
              {t(`diet.macro.${key}`)}
            </Text>
          </View>
        ))}
      </View>
      {onSetTarget ? (
        <Button
          label={t('diet.setTarget')}
          variant="ghost"
          size="small"
          block={false}
          onPress={onSetTarget}
        />
      ) : null}
    </Card>
  );
}
