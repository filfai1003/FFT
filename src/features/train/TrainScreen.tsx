import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { Translate } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Reveal } from '@/components/ui/motion';
import { Screen } from '@/components/ui/Screen';
import { IconTile } from '@/components/ui/IconTile';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { relativeDay } from '@/domain/day';
import { useToday } from '@/features/profile/use-today';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { useStartWorkout } from '@/features/session/start';
import { DayPill, shortDayLabel, type DayPillState } from './DayPill';
import { NewPlanSheet } from './NewPlanSheet';
import { PlanSheets, type PlanSheetKind } from './PlanDetailScreen';
import { estimateMinutes, useActivePlan, useRotation, type PlanView } from './plans';
import { useLastSessionDay } from './history';

export function TrainScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { plan, data: plans, isPending } = useActivePlan();
  const [menuPlan, setMenuPlan] = useState<PlanView | null>(null);
  const [sheet, setSheet] = useState<PlanSheetKind>(null);
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

  const openPlan = () =>
    plan && router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } });

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        {/* Canvas "Train": title, then the library and history as round buttons on the right. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {plan && rotation ? (
              <Text variant="bodyS" muted>
                {t('train.cycleProgress', {
                  n: rotation.state.cycle,
                  done: rotation.state.doneCount,
                  total: rotation.state.totalDays,
                })}
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

        {!isPending && !plan ? (
          <Card gap={12}>
            <Text variant="titleM">{t('train.emptyTitle')}</Text>
            <Button label={t('train.createPlan')} onPress={() => setCreating(true)} />
            <Button
              label={t('train.emptyWorkout')}
              variant="secondary"
              onPress={() => startEmpty(t('train.emptyWorkout'))}
            />
          </Card>
        ) : null}

        {plan && upNext ? (
          <Reveal index={1}>
            <Card gap={12}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <IconTile icon="dumbbell" area="training" size={60} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyS" semibold style={{ color: colors.trainingInk }}>
                    {t('train.nextWorkout')}
                  </Text>
                  <Text variant="displayM" numberOfLines={2}>
                    {upNext.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {t('train.exerciseCount', {
                      count: upNext.exercises.length,
                      min: estimateMinutes(upNext),
                    })}
                  </Text>
                </View>
              </View>
              <Button
                label={t('train.start')}
                icon="play"
                disabled={upNext.exercises.length === 0}
                onPress={() => startDay(plan, upNext, rotation)}
              />
              <Button label={t('train.differentDay')} variant="ghost" onPress={openPlan} />
            </Card>
          </Reveal>
        ) : plan ? (
          <Card gap={12}>
            <Text muted>{t('train.noDays')}</Text>
            <Button label={t('train.addDays')} variant="secondary" onPress={openPlan} />
          </Card>
        ) : null}

        {plan && plan.days.length > 0 ? (
          <Reveal index={2}>
            <Section title={t('train.thisCycle', { n: rotation?.state.cycle ?? 1 })} gap={8}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {plan.days.slice(0, 6).map((d) => (
                  <View key={d.id} style={{ flex: 1 }}>
                    <DayPill label={shortDayLabel(d.name)} state={pillState(d.id)} />
                  </View>
                ))}
              </View>
            </Section>
          </Reveal>
        ) : null}

        {plans && plans.length > 0 ? (
          <Section title={t('train.yourPlans')} gap={8}>
            {plans.map((p) => (
              <View
                key={p.id}
                style={{
                  minHeight: 60,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: radius.row + 2,
                  borderWidth: 1,
                  borderColor:
                    p.status === 'active' ? colors.borderSelected : colors.borderDecorative,
                  backgroundColor: colors.surface,
                  paddingLeft: 12,
                  gap: 12,
                  paddingRight: 4,
                }}
              >
                <IconTile
                  icon={
                    p.status === 'active'
                      ? 'dumbbell'
                      : p.status === 'archived'
                        ? 'archive'
                        : 'edit'
                  }
                  area={p.status === 'active' ? 'training' : 'neutral'}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                  onPress={() =>
                    router.push({ pathname: '/train/plan/[planId]', params: { planId: p.id } })
                  }
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 60,
                    justifyContent: 'center',
                    gap: 2,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="body">{p.name}</Text>
                  <Text variant="label" muted={p.status !== 'active'}>
                    {t('train.planInfo', {
                      count: p.days.length,
                      status: t(`train.status.${p.status}`),
                    })}
                  </Text>
                </Pressable>
                <IconButton
                  icon="more"
                  accessibilityLabel={t('train.planOptions', { name: p.name })}
                  onPress={() => {
                    setMenuPlan(p);
                    setSheet('menu');
                  }}
                />
              </View>
            ))}
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

type T = Translate;

function whenLabel(day: string, today: string, t: T): string {
  const r = relativeDay(day, today);
  if (r.kind === 'today') return t('common.today');
  if (r.kind === 'yesterday') return t('common.yesterday');
  if (r.kind === 'daysAgo') return t('common.daysAgo', { count: r.days });
  return r.label;
}
