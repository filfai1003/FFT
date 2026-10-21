import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { weekOf } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
import { displayWeight } from '@/domain/units';
import { shiftWeek, type WeeklySummary } from '@/domain/weekly-summary';
import { BadgeMedal, badgeName, dayMonth } from '@/features/gamification/components';
import { useRecordText } from '@/features/gamification/MeCards';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useBalance } from '@/features/progress/balance';
import { useBodyGoal } from '@/features/progress/data';
import { changeArea } from '@/features/progress/series';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { goBack } from '@/lib/navigation';
import { useWeeklySummary } from './data';
import { weightChangeText } from './text';

/** Sets as written: whole numbers plain, halves with one decimal (as Training balance). */
const setsText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * "Your week" (DECISIONS 122): opened by the Sunday notification or from Progress. Workouts
 * against the plan, days on the diet target, the week's weight change (green toward the goal),
 * the streak, badges earned and the closest ones, the best record and the most behind muscle
 * group. Earlier weeks with the arrows.
 */
export function WeeklySummaryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const today = useToday();
  const [day, setDay] = useState<string | undefined>(params.from);
  const { summary, dietTracked } = useWeeklySummary(day);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/progress')} backLabel={t('common.back')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyS" muted numeric>
            {summary
              ? t('weekly.range', { from: dayMonth(summary.from), to: dayMonth(summary.to) })
              : ' '}
          </Text>
          <Text variant="screenTitle" accessibilityRole="header">
            {summary && !summary.isCurrent ? t('weekly.titlePast') : t('weekly.title')}
          </Text>
        </View>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('weekly.prevWeek')}
          disabled={!summary}
          onPress={() => summary && setDay(shiftWeek(summary.from, -1))}
        />
        <IconButton
          icon="chevronRight"
          accessibilityLabel={t('weekly.nextWeek')}
          disabled={!summary || summary.isCurrent || shiftWeek(summary.from, 1) > today}
          onPress={() => summary && setDay(shiftWeek(summary.from, 1))}
        />
      </View>

      {summary ? (
        <WeekBody summary={summary} dietTracked={dietTracked} />
      ) : (
        <SkeletonGroup accessibilityLabel={t('common.loading')}>
          <SkeletonCard lines={0} height={140} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </SkeletonGroup>
      )}
    </Screen>
  );
}

function WeekBody({ summary: s, dietTracked }: { summary: WeeklySummary; dietTracked: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const unit = usePreferencesStore((st) => st.weightUnit);
  const goal = useProfile().data?.goal;
  const bodyGoal = useBodyGoal().data;
  const recordText = useRecordText();
  const today = useToday();
  const weekStart = usePreferencesStore((st) => st.weekStart);
  // Training balance (DECISIONS 121) covers this week and last week.
  const lastWeekFrom = shiftWeek(weekOf(today, weekStart)[0]!, -1);
  const range = s.isCurrent ? 'this' : s.from === lastWeekFrom ? 'last' : null;
  const balance = useBalance(range ?? 'last');

  const planned = s.planned;
  const weight = s.weight;
  const weightArea: Area =
    weight?.deltaKg != null
      ? changeArea(weight.deltaKg, goal, 0.05, {
          latest: weight.endKg,
          target: bodyGoal?.targetWeightKg ?? null,
        })
      : 'neutral';
  const behind = range && !balance.isPending ? balance.behind : null;

  return (
    <>
      <Card gap={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Gauge
            value={planned ? Math.min(1, s.workouts / planned) : s.workouts > 0 ? 1 : 0}
            size={96}
            stroke={9}
            color={colors.training}
            track={colors.trainingSoft}
            accessibilityLabel={
              planned
                ? t('weekly.workoutsOfA11y', { count: s.workouts, planned })
                : t('weekly.workoutsA11y', { count: s.workouts })
            }
          >
            <Icon name="dumbbell" size={18} color={colors.trainingInk} />
            <Text variant="displayM" numeric style={{ fontSize: 28, lineHeight: 30 }}>
              {formatInt(s.workouts)}
            </Text>
          </Gauge>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }} aria-hidden>
            <Text semibold>{t('weekly.workouts')}</Text>
            <Text variant="bodyS" muted>
              {planned ? t('weekly.ofPlanned', { count: planned }) : t('weekly.noPlan')}
            </Text>
            <Text variant="bodyS" muted>
              {t('weekly.trainedDays', { count: s.trainedDays.length })}
            </Text>
          </View>
        </View>
      </Card>

      <Card gap={12}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon="bowl" area="nutrition" size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text semibold>{t('weekly.diet')}</Text>
            <Text variant="bodyS" muted>
              {dietTracked ? t('weekly.ofDays', { count: s.daysPassed }) : t('weekly.noTarget')}
            </Text>
          </View>
          {dietTracked ? (
            <Text variant="displayS" numeric>
              {formatInt(s.dietOnTarget)}
            </Text>
          ) : null}
        </View>
        {dietTracked ? (
          <DotBar
            color={colors.nutrition}
            track={colors.nutritionSoft}
            total={7}
            on={s.dietOnTarget}
            size={8}
            accessibilityLabel={t('weekly.dietA11y', { count: s.dietOnTarget, days: s.daysPassed })}
          />
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card gap={8} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconTile icon="scale" area="neutral" size={28} />
            <Text variant="bodyS" semibold>
              {t('weekly.weight')}
            </Text>
          </View>
          {weight ? (
            <>
              <Text variant="displayS" numeric>
                {`${displayWeight(weight.endKg, unit).toFixed(1)} ${unit}`}
              </Text>
              {weight.deltaKg != null ? (
                <View style={{ alignSelf: 'flex-start' }}>
                  <StatusChip
                    area={weightArea}
                    icon={
                      weight.deltaKg < 0 ? 'arrowDown' : weight.deltaKg > 0 ? 'arrowUp' : undefined
                    }
                    label={weightChangeText(weight.deltaKg, unit)}
                  />
                </View>
              ) : (
                <Text variant="label" muted>
                  {t('weekly.noChange')}
                </Text>
              )}
            </>
          ) : (
            <Text variant="bodyS" muted>
              {t('weekly.noWeight')}
            </Text>
          )}
        </Card>
        <Card gap={8} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconTile icon="flame" area="streak" size={28} />
            <Text variant="bodyS" semibold>
              {t('weekly.streak')}
            </Text>
          </View>
          <Text variant="displayS" numeric>
            {formatInt(s.streak)}
          </Text>
          <Text variant="label" muted>
            {t('weekly.streakDays', { count: s.streak })}
          </Text>
        </Card>
      </View>

      {s.bestRecord ? (
        <Card gap={6}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon="trophy" area="streak" size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" muted>
                {t('weekly.bestRecord')}
              </Text>
              <Text semibold numberOfLines={1}>
                {recordText(s.bestRecord).name}
              </Text>
              <Text variant="bodyS" muted numeric>
                {`${recordText(s.bestRecord).value} ${unit} · ${recordText(s.bestRecord).gain}`}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {behind ? (
        <Card gap={6}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon="chart" area="training" size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" muted>
                {t('balance.behindTitle')}
              </Text>
              <Text semibold>
                {t('balance.behind', {
                  name: t(`library.muscle.${behind.muscle}`),
                  sets: t('balance.sets', { count: behind.sets, value: setsText(behind.sets) }),
                  when: t(`balance.when.${range ?? 'this'}`),
                })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card gap={12}>
        <Text semibold accessibilityRole="header">
          {t('weekly.badgesEarned')}
        </Text>
        {s.badgesEarned.length === 0 ? (
          <Text variant="bodyS" muted>
            {t('weekly.noBadges')}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {s.badgesEarned.map((b) => (
              <View key={b.id} style={{ alignItems: 'center', gap: 4, width: 76 }}>
                <BadgeMedal badge={b} size={56} />
                <Text variant="label" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {badgeName(t, b.id)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {s.closestBadges.length > 0 ? (
          <View
            style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}
          >
            <Text variant="bodyS" semibold>
              {t('weekly.closest')}
            </Text>
            {s.closestBadges.map((b) => (
              <View key={b.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <Text variant="bodyS" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {badgeName(t, b.id)}
                  </Text>
                  <Text variant="label" muted numeric>
                    {t('game.ofCount', { current: b.current, target: b.target })}
                  </Text>
                </View>
                <DotBar
                  color={colors.streak}
                  track={colors.streakSoft}
                  total={b.target}
                  on={b.current}
                  size={6}
                  accessibilityLabel={t('game.progressA11y', {
                    name: badgeName(t, b.id),
                    current: b.current,
                    target: b.target,
                  })}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </>
  );
}
