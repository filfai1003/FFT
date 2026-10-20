import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import type { Macros } from '@/domain/diet';
import { formatInt } from '@/domain/numbers';
import { calorieStatus, macroKeys, macroLeft, macroShares } from './summary';

type Props = {
  eaten: Macros;
  /** Null = no target (DECISIONS 104): what was eaten only, no "left", arc or bars to fill. */
  target: Macros | null;
  /** Bottom right: "2 of 4 meals". */
  caption?: string;
  /** Without a target: a quiet "Set a target" link. */
  onSetTarget?: () => void;
  /** The day's totals are still being read: a placeholder, never a misleading 0. */
  loading?: boolean;
};

/**
 * The day at a glance (canvas "Diet", DECISIONS 112): an arc filled with the macro colours of
 * what was eaten and the calories left (or over) inside, a filled bar per macro with the grams
 * left. A day with nothing logged is the same card, unfilled.
 */
export function DaySummaryCard({ eaten, target, caption, onSetTarget, loading }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (loading) return <SummarySkeleton />;
  if (!target) return <EatenCard eaten={eaten} caption={caption} onSetTarget={onSetTarget} />;
  const status = calorieStatus(eaten.kcal, target.kcal);
  const segments = macroShares(eaten).map((s) => ({
    share: s.share,
    color: colors.macroSplit[s.key],
  }));
  const amountLine = status.over
    ? t('diet.kcalOverShort', { kcal: formatInt(status.amount) })
    : t('diet.kcalLeftShort', { kcal: formatInt(status.amount) });

  return (
    <Card gap={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Gauge
          value={status.fill}
          size={136}
          stroke={14}
          sweep={0.75}
          color={status.wellOver ? colors.danger : colors.nutrition}
          segments={status.wellOver || segments.length === 0 ? undefined : segments}
          accessibilityLabel={`${t('diet.caloriesBar', {
            eaten: Math.round(eaten.kcal),
            target: Math.round(target.kcal),
          })}. ${amountLine}`}
        >
          <Text variant="displayM" numeric danger={status.wellOver}>
            {formatInt(status.amount)}
          </Text>
          <Text variant="bodyS" muted={!status.wellOver} danger={status.wellOver}>
            {status.over ? t('diet.kcalOver') : t('diet.kcalLeft')}
          </Text>
        </Gauge>
        <View style={{ flex: 1, gap: 10 }}>
          {macroKeys.map((key) => {
            const left = macroLeft(eaten[key], target[key]);
            const leftLine = left.over
              ? t('diet.macroOver', { g: left.grams })
              : t('diet.macroLeft', { g: left.grams });
            return (
              <View key={key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <Text variant="bodyS" semibold>
                    {t(`diet.macro.${key}`)}
                  </Text>
                  <Text variant="label" muted numeric>
                    {leftLine}
                  </Text>
                </View>
                <DotBar
                  total={Math.max(1, target[key])}
                  on={eaten[key]}
                  size={8}
                  color={colors.macroSplit[key]}
                  track={colors.macroSoft[key]}
                  accessibilityLabel={`${t('diet.macroBar', {
                    name: t(`diet.macro.${key}`),
                    eaten: Math.round(eaten[key]),
                    goal: Math.round(target[key]),
                  })}, ${leftLine}`}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          borderTopWidth: 1,
          borderColor: colors.divider,
          paddingTop: 12,
        }}
      >
        <Text variant="bodyS" muted numeric style={{ flexShrink: 1 }}>
          {t('diet.eatenTargetLine', {
            eaten: formatInt(eaten.kcal),
            target: formatInt(target.kcal),
          })}
        </Text>
        {caption ? (
          <Text variant="bodyS" semibold numeric>
            {caption}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** No target: calories eaten, and what they came from as one bar split in the macro colours. */
function EatenCard({ eaten, caption, onSetTarget }: Omit<Props, 'target' | 'loading'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const shares = macroShares(eaten);
  const pct = (key: (typeof macroKeys)[number]) =>
    Math.round((shares.find((s) => s.key === key)?.share ?? 0) * 100);
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
          <Text variant="bodyS" semibold numeric>
            {caption}
          </Text>
        ) : null}
      </View>
      {/* Where the calories came from: unfilled (the track) until something is logged. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          shares.length > 0
            ? t('diet.splitEaten', { p: pct('protein'), c: pct('carbs'), f: pct('fat') })
            : t('diet.splitEmpty')
        }
        style={{
          flexDirection: 'row',
          gap: 2,
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          backgroundColor: colors.dotOff,
        }}
      >
        {shares.map((s) =>
          s.share > 0 ? (
            <View
              key={s.key}
              style={{ flex: s.share, backgroundColor: colors.macroSplit[s.key] }}
            />
          ) : null,
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {macroKeys.map((key) => (
          <View key={key} style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.macroSplit[key],
                }}
              />
              <Text variant="bodyS" muted>
                {t(`diet.macro.${key}`)}
              </Text>
            </View>
            <Text variant="body" semibold numeric>
              {t('diet.grams', { g: Math.round(eaten[key]) })}
            </Text>
          </View>
        ))}
      </View>
      {onSetTarget ? (
        <View
          style={{
            borderTopWidth: 1,
            borderColor: colors.divider,
            paddingTop: 4,
            alignItems: 'flex-start',
          }}
        >
          <Button
            label={t('diet.setTarget')}
            variant="ghost"
            size="small"
            block={false}
            onPress={onSetTarget}
          />
        </View>
      ) : null}
    </Card>
  );
}

function SummarySkeleton() {
  const { t } = useTranslation();
  return (
    <SkeletonGroup accessibilityLabel={t('common.loading')}>
      <Skeleton height={190} style={{ borderRadius: radius.card }} />
    </SkeletonGroup>
  );
}
