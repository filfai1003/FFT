import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { Translate } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { InfoButton } from '@/components/ui/InfoButton';
import { pressFeedback, Reveal } from '@/components/ui/motion';
import { Screen } from '@/components/ui/Screen';
import { IconTile } from '@/components/ui/IconTile';
import { Section } from '@/components/ui/Section';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { relativeDay } from '@/domain/day';
import { useTimeZone } from '@/features/gamification/data';
import { FirstUseHint } from '@/features/help/FirstUseHint';
import { useToday } from '@/features/profile/use-today';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { useStartWorkout } from '@/features/session/start';
import { cycleDays, exerciseChips, lastDoneDay, type CycleDay } from './cycle';
import { CycleBar, DayTile, ExerciseChips } from './CycleDay';
import { NewPlanSheet } from './NewPlanSheet';
import { PlanSheets, type PlanSheetKind } from './PlanDetailScreen';
import {
  estimateMinutes,
  useActivePlan,
  usePlanSessions,
  useRotation,
  type PlanView,
} from './plans';
import { useLastSessionDay } from './history';

export function TrainScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { plan, data: plans, isPending } = useActivePlan();
  const [menuPlan, setMenuPlan] = useState<PlanView | null>(null);
  const [sheet, setSheet] = useState<PlanSheetKind>(null);
  const rotation = useRotation(plan);
  const sessions = usePlanSessions(plan?.id);
  const { startDay, startEmpty } = useStartWorkout();
  const [creating, setCreating] = useState(false);
  const today = useToday();
  const tz = useTimeZone();
  const lastDay = useLastSessionDay();

  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const days = plan ? cycleDays(plan.days, rotation, tz) : [];
  const upNextLast = upNext ? lastDoneDay(sessions.data, upNext.id, tz) : null;
  const lastWhen = lastDay.data ? agoLabel(lastDay.data, today, t as Translate) : null;

  const openPlan = () =>
    plan && router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } });

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        {/* Canvas "Train": title, then the library and history as round buttons on the right. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {lastWhen ? (
              <Text variant="bodyS" muted>
                {t('train.lastWorkout', { when: lastWhen })}
              </Text>
            ) : null}
            <Text variant="screenTitle" accessibilityRole="header">
              {t('nav.train')}
            </Text>
          </View>
          <IconButton
            icon="book"
            accessibilityLabel={t('train.library')}
            onPress={() => router.push('/train/library')}
          />
          <IconButton
            icon="clock"
            accessibilityLabel={
              lastDay.data
                ? `${t('train.history')}, ${t('train.historyLast', {
                    when: whenLabel(lastDay.data, today, t as Translate),
                  })}`
                : t('train.history')
            }
            onPress={() => router.push('/train/history')}
          />
        </View>

        <ActiveSessionBanner />

        {!isPending ? <FirstUseHint id="trainTips" /> : null}

        {isPending ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <SkeletonCard lines={1} height={52} />
            <SkeletonCard lines={0} />
            <SkeletonCard lines={0} />
          </SkeletonGroup>
        ) : null}

        {!isPending && !plan ? (
          <EmptyState
            icon="dumbbell"
            area="training"
            title={t('train.emptyTitle')}
            body={t('empty.trainBody')}
            action={{
              label: t('train.createPlan'),
              icon: 'plus',
              onPress: () => setCreating(true),
            }}
            actionVariant="primary"
            secondaryAction={{
              label: t('train.quickStart'),
              onPress: () => startEmpty(t('train.emptyWorkout')),
            }}
          />
        ) : null}

        {plan && upNext ? (
          <Reveal index={1}>
            {/* Up next: what, how long, when last; the exercises as chips; one big Start. */}
            <Card gap={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <IconTile icon="dumbbell" area="training" size={60} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="bodyS" semibold style={{ color: colors.trainingInk }}>
                      {t('train.upNext')}
                    </Text>
                    <InfoButton topic="cycle" />
                  </View>
                  <Text variant="displayM" numberOfLines={2}>
                    {upNext.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {[
                      t('train.exerciseCount', {
                        count: upNext.exercises.length,
                        min: estimateMinutes(upNext),
                      }),
                      upNextLast
                        ? t('train.lastTime', { when: agoLabel(upNextLast, today, t as Translate) })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
              <ExerciseChips {...exerciseChips(upNext)} />
              <View style={{ gap: 4 }}>
                <Button
                  label={t('plan.startDay', { name: upNext.name })}
                  icon="play"
                  disabled={upNext.exercises.length === 0}
                  onPress={() => startDay(plan, upNext, rotation)}
                />
                <Button label={t('train.differentDay')} variant="ghost" onPress={openPlan} />
              </View>
            </Card>
          </Reveal>
        ) : plan ? (
          <EmptyState
            icon="calendar"
            area="training"
            title={t('empty.planDaysTitle')}
            body={t('empty.planDaysBody')}
            action={{ label: t('train.addDays'), icon: 'plus', onPress: openPlan }}
            actionVariant="primary"
          />
        ) : null}

        {plan && rotation && days.length > 0 ? (
          <Reveal index={2}>
            {/* The cycle: one segment per day, then every day with its state. */}
            <Card gap={12}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Text variant="body" semibold accessibilityRole="header">
                  {t('train.thisCycle', { n: rotation.state.cycle })}
                </Text>
                <Text variant="bodyS" semibold muted numeric>
                  {t('train.cycleDone', {
                    done: rotation.state.doneCount,
                    total: rotation.state.totalDays,
                  })}
                </Text>
              </View>
              <CycleBar
                cycle={rotation.state.cycle}
                done={rotation.state.doneCount}
                total={rotation.state.totalDays}
              />
              <DayGrid days={days} onPress={openPlan} />
            </Card>
          </Reveal>
        ) : null}

        {plans && plans.length > 0 ? (
          <Section title={t('train.yourPlans')} gap={8} info="plan">
            {plans.map((p) => {
              const active = p.status === 'active';
              return (
                <View
                  key={p.id}
                  style={{
                    minHeight: 64,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: radius.row + 2,
                    borderWidth: 1,
                    borderColor: colors.borderDecorative,
                    backgroundColor: colors.surface,
                    paddingLeft: 12,
                    gap: 12,
                    paddingRight: 4,
                  }}
                >
                  <IconTile
                    icon={active ? 'dumbbell' : p.status === 'archived' ? 'archive' : 'edit'}
                    area={active ? 'training' : 'neutral'}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}, ${t(`train.status.${p.status}`)}`}
                    onPress={() =>
                      router.push({ pathname: '/train/plan/[planId]', params: { planId: p.id } })
                    }
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 60,
                      justifyContent: 'center',
                      gap: 2,
                      opacity: pressed ? pressFeedback.opacity : 1,
                    })}
                  >
                    <Text variant="body" semibold>
                      {p.name}
                    </Text>
                    <Text variant="bodyS" muted>
                      {active
                        ? [
                            t('plan.daysCount', { count: p.days.length }),
                            rotation ? t('train.cycle', { n: rotation.state.cycle }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : t('train.planInfo', {
                            count: p.days.length,
                            status: t(`train.status.${p.status}`),
                          })}
                    </Text>
                  </Pressable>
                  {active ? <StatusChip label={t('train.status.active')} area="training" /> : null}
                  <IconButton
                    icon="more"
                    look="plain"
                    accessibilityLabel={t('train.planOptions', { name: p.name })}
                    onPress={() => {
                      setMenuPlan(p);
                      setSheet('menu');
                    }}
                  />
                </View>
              );
            })}
            <Button
              label={t('train.newPlan')}
              icon="plus"
              variant="secondary"
              onPress={() => setCreating(true)}
            />
          </Section>
        ) : null}
      </Screen>
      <NewPlanSheet visible={creating} onClose={() => setCreating(false)} />
      {menuPlan ? (
        <PlanSheets
          plan={menuPlan}
          sheet={sheet}
          setSheet={(next) => {
            setSheet(next);
            if (next === null) setMenuPlan(null);
          }}
          onDuplicated={() => undefined}
          onDeleted={() => undefined}
        />
      ) : null}
    </>
  );
}

/** The days of the cycle, two per row. */
function DayGrid({ days, onPress }: { days: CycleDay[]; onPress: () => void }) {
  const rows: CycleDay[][] = [];
  for (let i = 0; i < days.length; i += 2) rows.push(days.slice(i, i + 2));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row[0].id} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map((d) => (
            <View key={d.id} style={{ flex: 1 }}>
              <DayTile day={d} onPress={onPress} />
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

type T = Translate;

function whenLabel(day: string, today: string, t: T): string {
  const r = relativeDay(day, today);
  if (r.kind === 'today') return t('common.today');
  if (r.kind === 'yesterday') return t('common.yesterday');
  if (r.kind === 'daysAgo') return t('common.daysAgo', { count: r.days });
  return r.label;
}

/** "today", "yesterday", "3 days ago", "on Oct 2": the end of "Last workout …". */
export function agoLabel(day: string, today: string, t: T): string {
  const r = relativeDay(day, today);
  if (r.kind === 'today') return t('train.ago.today');
  if (r.kind === 'yesterday') return t('train.ago.yesterday');
  if (r.kind === 'daysAgo') return t('train.ago.days', { count: r.days });
  return t('train.ago.date', { date: r.label });
}
