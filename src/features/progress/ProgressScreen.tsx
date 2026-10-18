import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusChip } from '@/components/ui/StatusChip';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { periods } from '@/domain/progress';
import { displayWeight } from '@/domain/units';
import {
  CommunityAvatarButton,
  CommunityView,
  useCommunityBottomSpace,
} from '@/features/community/CommunityView';
import { PillButton, dayMonth } from '@/features/gamification/components';
import { useGamification } from '@/features/gamification/data';
import { BadgeGrid, NextBadgeCard, RecordsRow, StreakCard } from '@/features/gamification/MeCards';
import { useProgressView, type ProgressView } from '@/features/gamification/progress-view';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { poses, useBodyEntries, usePhotos } from './data';
import { PhotoTile } from './PhotoTile';
import { bodyProgress, useProgressPeriod } from './series';
import { useStrength } from './strength';

export const signed = (n: number, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

/** Fill missing chart values so every column shows at least one dot. */
export const chartValues = (v: (number | null)[]) => {
  const real = v.filter((x): x is number => x != null);
  const min = real.length ? Math.min(...real) : 0;
  return v.map((x) => x ?? min);
};

/**
 * Progress tab, "Me" / "Community" (canvas ProgressMe, ProgressCommunity). Me: streak, level,
 * next badge, new records, the period's numbers (strength, body, photos) and every badge.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { period, setPeriod } = useProgressPeriod();
  const strength = useStrength(period);
  const game = useGamification();
  const { view, setView } = useProgressView();
  const [periodOpen, setPeriodOpen] = useState(false);
  const communityBottom = useCommunityBottomSpace();

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll bottomBarHeight={view === 'community' ? communityBottom : 24} gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="screenTitle" accessibilityRole="header">
              {t('nav.progress')}
            </Text>
          </View>
          {view === 'me' ? (
            // Canvas "Progress": a dark "Check-in" pill (the accent stays for the main actions).
            <Button
              variant="dark"
              size="small"
              block={false}
              icon="plus"
              label={t('checkIn.title')}
              accessibilityLabel={t('progress.newCheckIn')}
              onPress={() => router.push('/check-in')}
            />
          ) : (
            <CommunityAvatarButton />
          )}
        </View>

        <Segmented
          accessibilityLabel={t('progress.view')}
          value={view}
          onChange={(v: ProgressView) => setView(v)}
          options={[
            { value: 'me', label: t('progress.me') },
            { value: 'community', label: t('progress.community') },
          ]}
        />

        {view === 'community' ? (
          <CommunityView />
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 4,
                paddingLeft: 2,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="label" muted>
                  {t('progress.since', { date: dayMonth(strength.from) })}
                </Text>
                <Text variant="displayS" accessibilityRole="header">
                  {t('progress.youAreChanging')}
                </Text>
              </View>
              <PillButton
                label={t(`progress.periodLong.${period}`)}
                accessibilityLabel={t('progress.periodA11y', {
                  period: t(`progress.periodLong.${period}`),
                })}
                onPress={() => setPeriodOpen(true)}
              />
            </View>
            <MeNumbers records={game ? <RecordsRow game={game} /> : null} />
            {game ? (
              <>
                <Text
                  variant="titleM"
                  semibold
                  accessibilityRole="header"
                  style={{ paddingTop: 6, paddingLeft: 2 }}
                >
                  {t('progress.consistency')}
                </Text>
                <StreakCard game={game} />
                <NextBadgeCard game={game} />
                <BadgeGrid badges={game.badges} />
              </>
            ) : null}
          </>
        )}
        <Sheet
          visible={periodOpen}
          onClose={() => setPeriodOpen(false)}
          title={t('progress.periodTitle')}
          closeLabel={t('common.close')}
        >
          {periods.map((p) => (
            <OptionCard
              key={p}
              title={t(`progress.periodLong.${p}`)}
              selected={p === period}
              onPress={() => {
                setPeriod(p);
                setPeriodOpen(false);
              }}
            />
          ))}
        </Sheet>
      </Screen>
    </View>
  );
}

/**
 * The period's numbers, most important first (DECISIONS 107): weight, body fat, strength, then
 * records and photos. Changes are green when they go the right way for the goal, red otherwise.
 */
function MeNumbers({ records }: { records: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const goal = useProfile().data?.goal;
  const { period } = useProgressPeriod();
  const strength = useStrength(period);
  const entries = useBodyEntries();
  const photos = usePhotos();
  const body = bodyProgress(entries.data ?? [], period, today);

  const photoDays = new Set((photos.data ?? []).map((p) => p.day)).size;
  const lastPhotoDay = photos.data?.[0]?.day ?? null;
  const lastSet = photos.data?.filter((p) => p.day === lastPhotoDay) ?? [];
  const top = strength.groups.slice(0, 3);
  const noWeight = entries.isSuccess && !entries.data.some((e) => e.weightKg != null);

  const weightValue =
    body.weight.latestKg != null ? displayWeight(body.weight.latestKg, unit) : null;
  const weightDelta =
    body.weight.deltaKg != null
      ? displayWeight(Math.abs(body.weight.deltaKg), unit) * Math.sign(body.weight.deltaKg)
      : null;
  const weightArea: Area =
    weightDelta == null || Math.abs(weightDelta) < 0.05
      ? 'neutral'
      : goal === 'build_muscle'
        ? weightDelta > 0
          ? 'better'
          : 'worse'
        : goal === 'lose_fat'
          ? weightDelta < 0
            ? 'better'
            : 'worse'
          : 'neutral';
  const fatDelta = body.bodyFat.deltaPts;
  const fatArea: Area =
    fatDelta == null || fatDelta === 0 ? 'neutral' : fatDelta < 0 ? 'better' : 'worse';
  const weightLine = body.weight.buckets.filter((v): v is number => v != null);
  const fatLine = body.bodyFat.buckets.filter((v): v is number => v != null);
  // Waist: every value in the period, oldest first; smaller is better.
  const waist = body.measures.waist;
  const waistLine = (entries.data ?? [])
    .filter((e) => e.day >= body.from && e.measures.waist != null)
    .map((e) => e.measures.waist as number);
  const waistArea: Area =
    waist == null || waist.delta === 0 ? 'neutral' : waist.delta < 0 ? 'better' : 'worse';
  const weightStart = body.weight.points[0]?.value;
  // The line takes the colour of the change: green better, red worse, black otherwise.
  const lineColor = (a: Area) =>
    a === 'better' ? colors.success : a === 'worse' ? colors.danger : colors.text;
  const lineFill = (a: Area) =>
    a === 'better' ? colors.successSoft : a === 'worse' ? colors.dangerSoft : colors.surfaceAlt;
  const weekKg =
    body.weight.latestKg != null && body.weight.sevenDayKg != null && weightLine.length > 1
      ? displayWeight(
          Math.abs(body.weight.latestKg - (weightLine.at(-2) ?? body.weight.latestKg)),
          unit,
        ) * Math.sign(body.weight.latestKg - (weightLine.at(-2) ?? body.weight.latestKg))
      : null;

  if (entries.isPending || strength.isPending || photos.isPending)
    return (
      <SkeletonGroup accessibilityLabel={t('common.loading')}>
        <SkeletonCard lines={0} height={110} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SkeletonCard lines={1} />
          </View>
          <View style={{ flex: 1 }}>
            <SkeletonCard lines={1} />
          </View>
        </View>
        <SkeletonCard lines={0} height={90} />
      </SkeletonGroup>
    );

  return (
    <>
      <Card
        onPress={() => router.push('/progress/body')}
        accessibilityLabel={t('progress.tabWeight')}
        gap={12}
      >
        <CardHead label={t('progress.tabWeight')} icon="scale" />
        {noWeight ? (
          <EmptyState
            card={false}
            compact
            icon="scale"
            title={t('empty.weightTitle')}
            body={t('empty.weightBody')}
          />
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="displayL" numeric style={{ fontSize: 48, lineHeight: 50 }}>
                {weightValue ?? '—'}
              </Text>
              <Text muted>{unit}</Text>
            </View>
            {weightDelta != null ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <StatusChip
                  area={weightArea}
                  icon={weightDelta < 0 ? 'arrowDown' : weightDelta > 0 ? 'arrowUp' : undefined}
                  label={`${signed(Math.abs(weightDelta))} ${unit}`.replace(/^\+/, '')}
                />
                {weightStart != null ? (
                  <Text variant="label" muted numeric>
                    {t('progress.fromValue', {
                      value: displayWeight(weightStart, unit).toFixed(1),
                      unit,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        {weightLine.length > 1 ? (
          <>
            <Sparkline
              values={weightLine}
              height={110}
              color={lineColor(weightArea)}
              fill={lineFill(weightArea)}
              accessibilityLabel={t('progress.weightLine')}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" muted>
                {dayMonth(body.from)}
              </Text>
              {weekKg != null ? (
                <Text variant="label" muted numeric>
                  {t('progress.thisWeek', { value: `${signed(weekKg)} ${unit}` })}
                </Text>
              ) : null}
              <Text variant="label" muted>
                {t('common.today')}
              </Text>
            </View>
          </>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card
          onPress={() => router.push('/progress/body')}
          accessibilityLabel={t('progress.tabFat')}
          gap={10}
          style={{ flex: 1 }}
        >
          <CardHead label={t('progress.tabFat')} icon="heart" compact />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text variant="displayM" numeric>
              {body.bodyFat.latestPct ?? '—'}
            </Text>
            <Text variant="bodyS" muted>
              {'%'}
            </Text>
          </View>
          {fatLine.length > 1 ? (
            <Sparkline
              values={fatLine}
              height={44}
              color={lineColor(fatArea)}
              accessibilityLabel={t('progress.fatLine')}
            />
          ) : null}
          {fatDelta != null ? (
            <StatusChip
              area={fatArea}
              icon={fatDelta < 0 ? 'arrowDown' : fatDelta > 0 ? 'arrowUp' : undefined}
              label={t('progress.pts', { delta: signed(Math.abs(fatDelta)).replace(/^\+/, '') })}
            />
          ) : null}
        </Card>
        {waist ? (
          <Card
            onPress={() => router.push('/progress/body')}
            accessibilityLabel={t('progress.waist')}
            gap={10}
            style={{ flex: 1 }}
          >
            <CardHead label={t('progress.waist')} icon="list" compact />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <Text variant="displayM" numeric>
                {String(waist.value)}
              </Text>
              <Text variant="bodyS" muted>
                {'cm'}
              </Text>
            </View>
            {waistLine.length > 1 ? (
              <Sparkline
                values={waistLine}
                height={44}
                color={lineColor(waistArea)}
                accessibilityLabel={t('progress.waistLine')}
              />
            ) : null}
            {waist.delta !== 0 ? (
              <StatusChip
                area={waistArea}
                icon={waist.delta < 0 ? 'arrowDown' : 'arrowUp'}
                label={`${Math.abs(waist.delta)} cm`}
              />
            ) : null}
          </Card>
        ) : null}
      </View>

      <Card
        onPress={() => router.push('/progress/strength')}
        accessibilityLabel={t('progress.strength')}
        gap={12}
      >
        <CardHead label={t('progress.strength')} icon="dumbbell" area="training" />
        {strength.overall != null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text
                variant="displayL"
                numeric
                style={{ color: strength.overall >= 0 ? colors.successText : colors.danger }}
              >{`${signed(strength.overall)}%`}</Text>
              <Text variant="bodyS" muted style={{ flex: 1 }}>
                {t('progress.avgChange')}
              </Text>
            </View>
            <DotColumnChart
              values={chartValues(strength.series)}
              rows={8}
              stretch
              color={colors.trainingSoft}
              lastColor={colors.training}
              accessibilityLabel={t('progress.strengthChart', { pct: signed(strength.overall) })}
            />
            {top.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {top.map((g) => (
                  <View
                    key={g.group}
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      backgroundColor: colors.surfaceAlt,
                      padding: 10,
                      gap: 2,
                    }}
                  >
                    <Text variant="label" muted>
                      {t(`progress.group.${g.group}`)}
                    </Text>
                    <Text
                      variant="displayS"
                      numeric
                      style={{ color: g.pctChange >= 0 ? colors.successText : colors.danger }}
                    >{`${signed(g.pctChange, 0)}%`}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <EmptyState
            card={false}
            compact
            icon="chart"
            area="training"
            title={t('empty.strengthTitle')}
            body={t('empty.strengthBody')}
          />
        )}
      </Card>

      {records}

      <Card
        onPress={() => router.push('/progress/photos')}
        accessibilityLabel={t('progress.photos')}
        gap={10}
      >
        <CardHead
          label={
            lastPhotoDay
              ? t('progress.photosLast', {
                  date: shortDateLabel(lastPhotoDay).split(' ').slice(1).join(' '),
                })
              : t('progress.photos')
          }
        />
        {photos.isSuccess && photos.data.length === 0 ? (
          <EmptyState
            card={false}
            compact
            icon="camera"
            title={t('empty.photosTitle')}
            body={t('empty.photosShort')}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {poses.map((pose) => (
              <View key={pose} style={{ flex: 1 }}>
                <PhotoTile
                  photo={lastSet.find((p) => p.pose === pose)}
                  pose={pose}
                  height={72}
                  interactive={false}
                />
              </View>
            ))}
          </View>
        )}
      </Card>
      <Button
        label={t('progress.compare')}
        icon="swap"
        variant="secondary"
        disabled={photoDays < 2}
        onPress={() => router.push('/progress/photos/compare')}
      />
    </>
  );
}

/** Label of a card that opens a detail page, with its area's tile; the chevron says it opens. */
function CardHead({
  label,
  icon,
  area = 'neutral',
  compact = false,
}: {
  label: string;
  icon?: IconName;
  area?: Area;
  /** Half-width card: smaller tile, no chevron. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon ? <IconTile icon={icon} area={area} size={compact ? 32 : 36} /> : null}
      <Text semibold style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {compact ? null : <Icon name="chevronRight" size={16} color={colors.textMuted} />}
    </View>
  );
}
