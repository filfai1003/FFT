import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { SkeletonCard, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { formatInt } from '@/domain/numbers';
import { displayWeight } from '@/domain/units';
import {
  balanceRanges,
  movements,
  WEEKLY_SETS_GUIDE,
  type BalanceRange,
  type BalanceRow,
  type GuideStatus,
} from '@/domain/volume';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { goBack } from '@/lib/navigation';
import { useBalance } from './balance';

const { min: GUIDE_MIN, max: GUIDE_MAX } = WEEKLY_SETS_GUIDE;

/** Sets as written: whole numbers plain, halves (secondary muscles) with one decimal. */
const setsText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const statusIcon: Record<GuideStatus, IconName> = {
  under: 'arrowDown',
  within: 'check',
  over: 'arrowUp',
};

/** The words a screen reader hears for a row ("Chest, 12 sets this week, within the 10 to 20 guideline"). */
function useRowLabel(range: BalanceRange) {
  const { t } = useTranslation();
  return (r: BalanceRow) =>
    t('balance.rowA11y', {
      name: t(`library.muscle.${r.muscle}`),
      sets: t('balance.sets', { count: r.sets, value: setsText(r.sets) }),
      when: t(`balance.when.${range}`),
      status: t(`balance.statusLong.${r.status}`, { min: GUIDE_MIN, max: GUIDE_MAX }),
    });
}

/**
 * A horizontal bar of weekly sets with the guideline band marked behind it (training colour,
 * read from the theme: the area colours can be changed, DECISIONS 118). Decoration only: the
 * number and the status words next to it say the same.
 */
export function BalanceBar({
  sets,
  scale,
  height = 8,
}: {
  sets: number;
  scale: number;
  height?: number;
}) {
  const { colors } = useTheme();
  const pct = (v: number): `${number}%` => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const band = height + 8;
  return (
    <View aria-hidden style={{ height: band, justifyContent: 'center' }}>
      <View
        style={{ height, borderRadius: height / 2, backgroundColor: colors.dotOff, width: '100%' }}
      />
      {/* The guideline: a soft band with its two edges in the control border colour (≥ 3:1). */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: pct(GUIDE_MIN),
          width: pct(GUIDE_MAX - GUIDE_MIN),
          backgroundColor: colors.trainingSoft,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderColor: colors.borderControl,
          borderRadius: 3,
        }}
      />
      {sets > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: pct(sets),
            minWidth: height,
            height,
            borderRadius: height / 2,
            backgroundColor: colors.training,
          }}
        />
      ) : null}
    </View>
  );
}

/** The bars' scale: the guideline with some room above it, or the biggest number. */
const scaleOf = (rows: readonly BalanceRow[]) =>
  Math.max(GUIDE_MAX + 4, ...rows.map((r) => Math.ceil(r.sets)));

/** Progress · Me: how many groups are within the guideline this week, and who is behind. */
export function BalanceCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const b = useBalance('this');
  const label = useRowLabel('this');
  if (b.isPending) return null;
  const scale = scaleOf(b.rows);

  const summary = b.empty
    ? t('balance.emptyTitle.this')
    : t('balance.cardWithin', { within: b.within, total: b.rows.length });
  const behind = b.behind
    ? t('balance.behind', {
        name: t(`library.muscle.${b.behind.muscle}`),
        sets: t('balance.sets', { count: b.behind.sets, value: setsText(b.behind.sets) }),
        when: t('balance.when.this'),
      })
    : null;

  return (
    <Card
      onPress={() => router.push('/progress/balance')}
      accessibilityLabel={[t('balance.title'), summary, behind].filter(Boolean).join('. ')}
      gap={12}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon="train" area="training" size={36} />
        <Text semibold style={{ flex: 1 }} numberOfLines={1}>
          {t('balance.title')}
        </Text>
        <Icon name="chevronRight" size={16} color={colors.textMuted} />
      </View>
      {b.empty ? (
        <View style={{ gap: 2 }}>
          <Text variant="titleM" semibold>
            {t('balance.emptyTitle.this')}
          </Text>
          <Text variant="bodyS" muted>
            {t('balance.emptyBody')}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text variant="displayM" numeric>
            {t('balance.ofTotal', { within: b.within, total: b.rows.length })}
          </Text>
          <Text variant="bodyS" muted style={{ flex: 1 }}>
            {t('balance.cardWithinShort', { min: GUIDE_MIN, max: GUIDE_MAX })}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 14 }}>
        {b.rows.map((r) => (
          <View
            key={r.muscle}
            accessible
            accessibilityLabel={label(r)}
            style={{ width: '46%', flexGrow: 1, gap: 2 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" muted>
                {t(`library.muscle.${r.muscle}`)}
              </Text>
              <Text variant="label" semibold numeric>
                {setsText(r.sets)}
              </Text>
            </View>
            <BalanceBar sets={r.sets} scale={scale} height={6} />
          </View>
        ))}
      </View>
      {behind ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="arrowDown" size={14} color={colors.text} />
          <Text variant="bodyS" semibold style={{ flex: 1 }}>
            {behind}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Training balance: weekly hard sets per muscle group against the 10–20 guideline. */
export function BalanceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const [range, setRange] = useState<BalanceRange>('this');
  const b = useBalance(range);
  const label = useRowLabel(range);
  const scale = scaleOf(b.rows);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/progress')} backLabel={t('common.back')} />
      <Text variant="screenTitle" accessibilityRole="header">
        {t('balance.title')}
      </Text>

      <Segmented
        accessibilityLabel={t('balance.rangeA11y')}
        value={range}
        onChange={setRange}
        options={balanceRanges.map((r) => ({ value: r, label: t(`balance.range.${r}`) }))}
      />

      {/* The guideline first, so the band on every bar reads at once. */}
      <Card gap={10}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 56 }}>
            <BalanceBar sets={0} scale={GUIDE_MAX + 4} />
          </View>
          <Text variant="bodyS" semibold style={{ flex: 1 }}>
            {t('balance.guide', { min: GUIDE_MIN, max: GUIDE_MAX })}
          </Text>
        </View>
        <Text variant="bodyS" muted>
          {t('balance.guideNote')}
        </Text>
      </Card>

      {b.isPending ? (
        <SkeletonGroup accessibilityLabel={t('common.loading')}>
          <SkeletonCard tile={false} lines={1} />
          <SkeletonRows count={6} leading={false} />
        </SkeletonGroup>
      ) : b.empty ? (
        <EmptyState
          compact
          icon="train"
          area="training"
          title={t(`balance.emptyTitle.${range}`)}
          body={t('balance.emptyBody')}
        />
      ) : (
        <>
          {b.behind ? (
            <Card gap={4}>
              <Text variant="label" muted>
                {t('balance.behindTitle')}
              </Text>
              <Text variant="titleM" semibold>
                {t('balance.behind', {
                  name: t(`library.muscle.${b.behind.muscle}`),
                  sets: t('balance.sets', { count: b.behind.sets, value: setsText(b.behind.sets) }),
                  when: t(`balance.when.${range}`),
                })}
              </Text>
            </Card>
          ) : null}
          {movements.map((m) => {
            const rows = b.rows.filter((r) => r.movement === m);
            return (
              <Section key={m} title={t(`balance.movement.${m}`)}>
                <Card gap={0} style={{ paddingVertical: 4 }}>
                  {rows.map((r, i) => (
                    <View
                      key={r.muscle}
                      accessible
                      accessibilityLabel={label(r)}
                      style={{
                        minHeight: 52,
                        paddingVertical: 10,
                        gap: 6,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderColor: colors.borderDecorative,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text variant="body" semibold style={{ flex: 1 }}>
                          {t(`library.muscle.${r.muscle}`)}
                        </Text>
                        <Text variant="titleM" semibold numeric>
                          {setsText(r.sets)}
                        </Text>
                        <Text variant="bodyS" muted>
                          {t('balance.setsUnit', { count: r.sets })}
                        </Text>
                      </View>
                      <BalanceBar sets={r.sets} scale={scale} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {/* Neutral on purpose: a guideline, not a verdict (icon + words). */}
                        <StatusChip
                          icon={statusIcon[r.status]}
                          label={t(`balance.status.${r.status}`)}
                        />
                        {r.volumeKg > 0 ? (
                          <Text variant="label" muted numeric style={{ flex: 1 }}>
                            {t('balance.volume', {
                              value: formatInt(Math.round(displayWeight(r.volumeKg, unit))),
                              unit,
                            })}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Card>
              </Section>
            );
          })}
        </>
      )}

      <Card gap={6}>
        <Text semibold accessibilityRole="header">
          {t('balance.howTitle')}
        </Text>
        <Text variant="bodyS" muted>
          {t('balance.howBody')}
        </Text>
      </Card>
    </Screen>
  );
}
