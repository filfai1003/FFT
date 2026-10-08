import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { Translate } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { relativeDay, weekdayName, localDay, deviceTimeZone } from '@/domain/day';
import { useToday } from '@/features/profile/use-today';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { useStartWorkout } from '@/features/session/start';
import { DayPill, shortDayLabel, type DayPillState } from './DayPill';
import { NewPlanSheet } from './NewPlanSheet';
import { estimateMinutes, useActivePlan, useRotation, type PlanView } from './plans';
import { useLastSessionDay } from './history';

export function TrainScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const { plan, others, isPending } = useActivePlan();
  const rotation = useRotation(plan);
  const { startDay, startEmpty } = useStartWorkout();
  const [creating, setCreating] = useState(false);
  const today = useToday();
  const lastDay = useLastSessionDay();

  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];

  const pillState = (id: string): DayPillState => {
    if (id === rotation?.state.upNextDayId) return 'next';
    const done = rotation?.doneThisCycle.get(id);
    if (done) return done.out_of_order ? 'doneOutOfOrder' : 'done';
    return 'todo';
  };

  const outOfOrder = plan && rotation ? outOfOrderNote(plan, rotation, t as Translate) : null;

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            {plan && rotation ? (
              <Text variant="label" muted>
                {t('train.cycle', { n: rotation.state.cycle })}
              </Text>
            ) : null}
            <Text variant="screenTitle">{t('nav.train')}</Text>
          </View>
          <IconButton
            icon="plus"
            accessibilityLabel={t('train.newPlan')}
            onPress={() => setCreating(true)}
          />
        </View>

        <ActiveSessionBanner />

        {!isPending && !plan ? (
          <Card gap={12}>
            <Text variant="titleM">{t('train.emptyTitle')}</Text>
            <Text muted>{t('train.emptyBody')}</Text>
            <Button label={t('train.createPlan')} onPress={() => setCreating(true)} />
            <Button
              label={t('train.emptyWorkout')}
              variant="secondary"
              onPress={() => startEmpty(t('train.emptyWorkout'))}
            />
          </Card>
        ) : null}

        {plan ? (
          <Card gap={12}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('train.activePlan')}: ${plan.name}`}
              onPress={() =>
                router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } })
              }
              style={{ minHeight: touch.minTarget, gap: 4, justifyContent: 'center' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
                />
                <Text variant="label" muted>
                  {t('train.activePlan')}
                </Text>
              </View>
              <Text variant="titleM">{plan.name}</Text>
            </Pressable>

            {plan.days.length > 0 ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {plan.days.slice(0, 6).map((d) => (
                    <View key={d.id} style={{ flex: 1 }}>
                      <DayPill label={shortDayLabel(d.name)} state={pillState(d.id)} />
                    </View>
                  ))}
                </View>
                {outOfOrder ? (
                  <Text variant="bodyS" muted>
                    {outOfOrder}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {upNext ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderTopWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.borderDecorative,
                  paddingTop: 12,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" muted>
                    {t('train.upNext')}
                  </Text>
                  <Text variant="displayM" numberOfLines={1}>
                    {upNext.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {t('train.exerciseCount', {
                      count: upNext.exercises.length,
                      min: estimateMinutes(upNext),
                    })}
                  </Text>
                </View>
                <Button
                  label={t('train.start')}
                  icon="play"
                  block={false}
                  disabled={upNext.exercises.length === 0}
                  onPress={() => startDay(plan, upNext, rotation)}
                />
              </View>
            ) : (
              <Button
                label={t('train.addDays')}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } })
                }
              />
            )}

            <Button
              label={t('train.differentDay')}
              variant="ghost"
              onPress={() =>
                router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } })
              }
            />
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NavTile
            title={t('train.library')}
            info={t('train.libraryInfo')}
            onPress={() => router.push('/train/library')}
          />
          <NavTile
            title={t('train.history')}
            info={
              lastDay.data
                ? t('train.historyLast', { when: whenLabel(lastDay.data, today, t as Translate) })
                : t('train.historyNone')
            }
            onPress={() => router.push('/train/history')}
          />
        </View>

        {others.length > 0 ? (
          <Section title={t('train.otherPlans')} gap={8}>
            {others.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                onPress={() =>
                  router.push({ pathname: '/train/plan/[planId]', params: { planId: p.id } })
                }
                style={({ pressed }) => ({
                  minHeight: 60,
                  borderRadius: radius.row + 2,
                  borderWidth: 1,
                  borderColor: colors.borderDecorative,
                  backgroundColor: colors.surfaceAlt,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  gap: 2,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text variant="body">{p.name}</Text>
                <Text variant="label" muted>
                  {t('train.planInfo', {
                    count: p.days.length,
                    status: t(`train.status.${p.status}`),
                  })}
                </Text>
              </Pressable>
            ))}
          </Section>
        ) : null}
      </Screen>
      <NewPlanSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NavTile({ title, info, onPress }: { title: string; info: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${info}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 92,
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: 16,
        paddingVertical: 14,
        justifyContent: 'flex-end',
        gap: 2,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="body" medium>
        {title}
      </Text>
      <Text variant="label" muted>
        {info}
      </Text>
    </Pressable>
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

/** "Legs was done out of order on Wednesday, so Push is still up next." */
function outOfOrderNote(
  plan: PlanView,
  rotation: NonNullable<ReturnType<typeof useRotation>>,
  t: T,
) {
  const next = plan.days.find((d) => d.id === rotation.state.upNextDayId);
  if (!next) return null;
  const tz = deviceTimeZone();
  for (const day of plan.days) {
    const s = rotation.doneThisCycle.get(day.id);
    if (s?.out_of_order) {
      return t('train.outOfOrderNote', {
        done: day.name,
        weekday: weekdayName(localDay(new Date(s.started_at), tz)),
        next: next.name,
      });
    }
  }
  return null;
}
