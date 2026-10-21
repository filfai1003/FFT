import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { periods } from '@/domain/progress';
import { displayLength, displayWeight } from '@/domain/units';
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
import { BalanceCard } from './BalanceScreens';
import { ThisWeekCard } from '@/features/weekly/ThisWeekCard';
import { poses, useBodyEntries, useBodyGoal, usePhotos } from './data';
import { EmptyLine } from './EmptyLine';
import { PhotoTile } from './PhotoTile';
import { bodyProgress, changeArea, useProgressPeriod } from './series';
import { useStrength } from './strength';

export const signed = (n: number, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

/** Text colour of a change: green better (up), red worse (down), plain text when nothing moved. */
export function useChangeInk() {
  const { colors } = useTheme();
  return (n: number) => (n > 0 ? colors.successText : n < 0 ? colors.danger : colors.text);
}

/** A change said in words for screen readers ("down 1.8 kg"): the arrow of a chip is not read. */
export function useChangeWords() {
  const { t } = useTranslation();
  return (delta: number, text: string) =>
    delta < 0
      ? t('progress.downBy', { value: text })
      : delta > 0
        ? t('progress.upBy', { value: text })
        : t('progress.steady');
}

/** A line takes the colour of its change: green better, red worse, black otherwise. */
export function useLineColors() {
  const { colors } = useTheme();
  return {
    lineColor: (a: Area) =>
      a === 'better' ? colors.success : a === 'worse' ? colors.danger : colors.text,
    lineFill: (a: Area) =>
      a === 'better' ? colors.successSoft : a === 'worse' ? colors.dangerSoft : colors.surfaceAlt,
  };
}

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
  const { colors } = useTheme();
  const { period, setPeriod } = useProgressPeriod();
  const strength = useStrength(period);
  const game = useGamification();
  const { view, setView } = useProgressView();
  const [periodOpen, setPeriodOpen] = useState(false);
  const communityBottom = useCommunityBottomSpace();

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll bottomBarHeight={view === 'community' ? communityBottom : 24} gap={14}>
        <PageHeader
          title={t('nav.progress')}
          actions={
            view === 'me' ? (
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
            )
          }
        />

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
                {/* The weekly summary without the notification (DECISIONS 122). */}
                <ThisWeekCard />
                {/* The day-by-day calendar (workouts, diet, supplements; DECISIONS 123). */}
                <Card
                  onPress={() => router.push('/calendar')}
                  accessibilityLabel={`${t('progress.calendarLink')}, ${t('progress.calendarLinkInfo')}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <IconTile icon="calendar" area="neutral" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text semibold>{t('progress.calendarLink')}</Text>
                      <Text variant="bodyS" muted>
                        {t('progress.calendarLinkInfo')}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={20} color={colors.textMuted} />
                  </View>
                </Card>
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
  const changeInk = useChangeInk();
  const words = useChangeWords();
  const router = useRouter();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const lengthUnit = usePreferencesStore((s) => s.lengthUnit);
  // The waist in the user's length unit (cm or inches).
  const inLength = (cm: number) => displayLength(cm, lengthUnit);
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
  const noPhotos = photos.isSuccess && photos.data.length === 0;
  const hasFat = body.bodyFat.latestPct != null;
  // Nothing to open yet: the card goes straight to the check-in that fills it (DECISIONS 114).
  const open = (filled: boolean, page: '/progress/body' | '/progress/photos') =>
    router.push(filled ? page : '/check-in');

  const weightValue =
    body.weight.latestKg != null ? displayWeight(body.weight.latestKg, unit) : null;
  const weightDelta =
    body.weight.deltaKg != null
      ? displayWeight(Math.abs(body.weight.deltaKg), unit) * Math.sign(body.weight.deltaKg)
      : null;
  const bodyGoal = useBodyGoal().data;
  // Green toward the target when one is set (kg, like the target).
  const weightArea: Area = changeArea(body.weight.deltaKg, goal, 0.05, {
    latest: body.weight.latestKg,
    target: bodyGoal?.targetWeightKg ?? null,
  });
  const fatDelta = body.bodyFat.deltaPts;
  const fatArea: Area = changeArea(fatDelta, 'smallerIsBetter', 0.05, {
    latest: body.bodyFat.latestPct,
    target: bodyGoal?.targetBodyFatPct ?? null,
  });
  // A line needs two values logged in the period (the buckets carry the last one forward).
  const weightLine =
    body.weight.points.length > 1 ? body.weight.buckets.filter((v): v is number => v != null) : [];
  const fatLine =
    body.bodyFat.count > 1 ? body.bodyFat.buckets.filter((v): v is number => v != null) : [];
  // Waist: every value in the period, oldest first; smaller is better.
  const waist = body.measures.waist;
  const waistLine = (entries.data ?? [])
    .filter((e) => e.day >= body.from && e.measures.waist != null)
    .map((e) => e.measures.waist as number);
  const waistArea: Area = changeArea(waist?.delta ?? null, 'smallerIsBetter');
  const weightStart = body.weight.points[0]?.value;
  const { lineColor, lineFill } = useLineColors();
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
        onPress={() => open(!noWeight, '/progress/body')}
        accessibilityLabel={
          noWeight
            ? `${t('empty.weightTitle')}. ${t('progress.newCheckIn')}`
            : [
                t('progress.tabWeight'),
                weightValue != null ? `${weightValue} ${unit}` : null,
                weightDelta != null
                  ? words(weightDelta, `${Math.abs(weightDelta).toFixed(1)} ${unit}`)
                  : null,
              ]
                .filter(Boolean)
                .join(', ')
        }
        gap={12}
      >
        <CardHead label={t('progress.tabWeight')} icon="scale" />
        {noWeight ? (
          // The full card not filled in yet: where the number and the line will be.
          <>
            <View style={{ gap: 2 }}>
              <Text variant="titleM" semibold>
                {t('empty.weightTitle')}
              </Text>
              <Text variant="bodyS" muted>
                {t('empty.weightBody')}
              </Text>
            </View>
            <EmptyLine height={80} />
            <AddHint label={t('progress.addAtCheckIn')} />
          </>
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
        ) : !noWeight ? (
          <>
            <EmptyLine height={80} start />
            <Text variant="label" muted>
              {t('progress.lineNext')}
            </Text>
          </>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <HalfStat
          label={t('progress.tabFat')}
          icon="heart"
          value={hasFat ? String(body.bodyFat.latestPct) : null}
          unit="%"
          line={fatLine}
          lineLabel={t('progress.fatLine')}
          color={lineColor(fatArea)}
          change={
            fatDelta == null
              ? null
              : {
                  area: fatArea,
                  delta: fatDelta,
                  label:
                    fatDelta === 0
                      ? t('progress.steady')
                      : t('progress.pts', { delta: signed(Math.abs(fatDelta)).replace(/^\+/, '') }),
                }
          }
          onPress={() => open(hasFat, '/progress/body')}
        />
        <HalfStat
          label={t('progress.waist')}
          icon="list"
          value={waist ? String(inLength(waist.value).value) : null}
          unit={inLength(0).unit}
          line={waistLine}
          lineLabel={t('progress.waistLine')}
          color={lineColor(waistArea)}
          change={
            !waist || waistLine.length < 2
              ? null
              : {
                  area: waistArea,
                  delta: waist.delta,
                  label:
                    waist.delta === 0
                      ? t('progress.steady')
                      : `${inLength(Math.abs(waist.delta)).value} ${inLength(0).unit}`,
                }
          }
          onPress={() => open(waist != null, '/progress/body')}
        />
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
                style={{ color: changeInk(strength.overall) }}
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
                      style={{ color: changeInk(g.pctChange) }}
                    >{`${signed(g.pctChange, 0)}%`}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          // The card not filled in yet: what is missing, over the empty columns of the chart.
          <>
            <View style={{ gap: 2 }}>
              <Text variant="titleM" semibold>
                {t('empty.strengthTitle')}
              </Text>
              <Text variant="bodyS" muted>
                {t('empty.strengthBody')}
              </Text>
            </View>
            <View aria-hidden>
              <DotColumnChart
                values={strength.series.map(() => 0)}
                min={0}
                max={1}
                rows={8}
                stretch
                color={colors.chartDotOff}
                accessibilityLabel={t('empty.strengthTitle')}
              />
            </View>
          </>
        )}
      </Card>

      <BalanceCard />

      {records}

      <Card
        onPress={() => open(!noPhotos, '/progress/photos')}
        accessibilityLabel={
          noPhotos ? `${t('empty.photosTitle')}. ${t('photos.add')}` : t('progress.photos')
        }
        gap={10}
      >
        <CardHead
          icon="camera"
          label={
            lastPhotoDay
              ? t('progress.photosLast', {
                  date: shortDateLabel(lastPhotoDay).split(' ').slice(1).join(' '),
                })
              : t('progress.photos')
          }
        />
        {noPhotos ? (
          <Text variant="bodyS" muted>
            {t('progress.firstBefore')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {poses.map((pose) => (
            <View key={pose} style={{ flex: 1 }}>
              <PhotoTile
                photo={lastSet.find((p) => p.pose === pose)}
                pose={pose}
                height={noPhotos ? 88 : 72}
                interactive={false}
                invite={noPhotos}
              />
            </View>
          ))}
        </View>
      </Card>
      {/* Nothing to compare before the first photos: the card above invites them instead. */}
      {noPhotos ? null : (
        <Button
          label={t('progress.compare')}
          icon="swap"
          variant="secondary"
          disabled={photoDays < 2}
          onPress={() => router.push('/progress/photos/compare')}
        />
      )}
    </>
  );
}

/** A half-width number card (body fat, waist): the value, its line and its change. */
function HalfStat({
  label,
  icon,
  value,
  unit,
  line,
  lineLabel,
  color,
  change,
  onPress,
}: {
  label: string;
  icon: IconName;
  /** Null: nothing logged yet, the card invites the first check-in. */
  value: string | null;
  unit: string;
  line: readonly number[];
  lineLabel: string;
  color: string;
  change: { area: Area; delta: number; label: string } | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const words = useChangeWords();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={
        value == null
          ? `${label}: ${t('progress.noneYet')}. ${t('progress.newCheckIn')}`
          : [label, `${value} ${unit}`, change ? words(change.delta, change.label) : null]
              .filter(Boolean)
              .join(', ')
      }
      gap={10}
      style={{ flex: 1 }}
    >
      <CardHead label={label} icon={icon} compact />
      {value == null ? (
        <>
          <AddHint label={t('progress.addAtCheckIn')} />
          <EmptyLine height={44} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text variant="displayM" numeric>
              {value}
            </Text>
            <Text variant="bodyS" muted>
              {unit}
            </Text>
          </View>
          {line.length > 1 ? (
            <Sparkline values={line} height={44} color={color} accessibilityLabel={lineLabel} />
          ) : (
            <EmptyLine height={44} start />
          )}
          {change ? (
            <StatusChip
              area={change.area}
              icon={change.delta < 0 ? 'arrowDown' : change.delta > 0 ? 'arrowUp' : undefined}
              label={change.label}
            />
          ) : line.length > 1 ? null : (
            <Text variant="label" muted>
              {t('progress.lineNext')}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

/** "+ Add at check-in": where a number will be once it is logged. */
function AddHint({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.borderControl,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="plus" size={14} color={colors.text} />
      </View>
      <Text variant="bodyS" semibold style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
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
