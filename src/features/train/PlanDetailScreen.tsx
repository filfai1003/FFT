import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile } from '@/components/ui/IconTile';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useTimeZone } from '@/features/gamification/data';
import { useStartWorkout } from '@/features/session/start';
import { cycleDays, exerciseChips, type CycleDay } from './cycle';
import { CycleBar, DayBadge, ExerciseChips } from './CycleDay';
import {
  useDeletePlan,
  useDuplicatePlan,
  usePlan,
  useRotation,
  useSetPlanStatus,
  useUpdatePlan,
  type PlanDayView,
  type PlanView,
} from './plans';
import { goBack, useBack } from '@/lib/navigation';

export type PlanSheetKind = null | 'menu' | 'rename' | 'deletePlan';
type SheetKind = PlanSheetKind;

export function PlanDetailScreen({ planId }: { planId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const back = useBack('/train');
  const plan = usePlan(planId);
  const rotation = useRotation(plan.data);
  const { startDay, startEmpty } = useStartWorkout();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const tz = useTimeZone();

  if (!plan.data) return <Screen>{null}</Screen>;
  const p = plan.data;
  const active = p.status === 'active';
  const days = cycleDays(p.days, active ? rotation : null, tz);

  const tagFor = (d: PlanDayView, c: CycleDay): string => {
    const count = t('plan.exerciseCount', { count: d.exercises.length });
    if (c.state === 'next') return `${t('plan.tagUpNext')} · ${count}`;
    if (c.state === 'done')
      return c.outOfOrder
        ? t('plan.tagDoneOut', { weekday: c.weekday ?? '' })
        : t('plan.tagDone', { weekday: c.weekday ?? '' });
    return active ? `${t('plan.tagThisCycle')} · ${count}` : count;
  };

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar
          onBack={back}
          backLabel={t('common.back')}
          right={
            <IconButton
              icon="more"
              accessibilityLabel={t('plan.more')}
              onPress={() => setSheet('menu')}
            />
          }
        />

        {/* Canvas "Plan detail": training tile, the name, then its state as chips. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon="dumbbell" area={active ? 'training' : 'neutral'} size={56} />
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <Text variant="screenTitle" accessibilityRole="header">
              {p.name}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <StatusChip
                label={t(`train.status.${p.status}`)}
                area={active ? 'training' : 'neutral'}
              />
              <StatusChip label={t('plan.daysCount', { count: p.days.length })} />
              {active && rotation ? (
                <StatusChip label={t('train.cycle', { n: rotation.state.cycle })} />
              ) : null}
            </View>
          </View>
        </View>

        {active && rotation && p.days.length > 0 ? (
          <View style={{ gap: 6 }}>
            <CycleBar
              cycle={rotation.state.cycle}
              done={rotation.state.doneCount}
              total={rotation.state.totalDays}
            />
            <Text variant="bodyS" muted>
              {`${t('train.cycleDone', {
                done: rotation.state.doneCount,
                total: rotation.state.totalDays,
              })} · ${t('plan.anyDayShort')}`}
            </Text>
          </View>
        ) : (
          <Text variant="bodyS" muted>
            {t('plan.anyDay')}
          </Text>
        )}

        <View style={{ gap: 10 }}>
          {p.days.map((d, index) => {
            const c = days[index];
            const isNext = c.state === 'next';
            return (
              <View
                key={d.id}
                style={{
                  // Canvas "Plan detail": white cards, the next day selected with a 2px border.
                  borderRadius: radius.card,
                  borderWidth: isNext ? 2 : 1,
                  borderColor: isNext ? colors.borderSelected : colors.borderDecorative,
                  backgroundColor: colors.surface,
                  paddingTop: isNext ? 11 : 12,
                  paddingBottom: isNext ? 11 : 12,
                  paddingLeft: isNext ? 13 : 14,
                  paddingRight: isNext ? 7 : 8,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <DayBadge n={c.n} state={c.state} size={36} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('plan.editDay', { name: d.name })}
                    onPress={() =>
                      router.push({
                        pathname: '/plan-day/[dayId]',
                        params: { dayId: d.id, planId: p.id },
                      })
                    }
                    style={{ flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text variant="bodyL" semibold>
                      {d.name}
                    </Text>
                    <Text
                      variant="label"
                      semibold
                      style={{ color: isNext ? colors.trainingInk : colors.textMuted }}
                    >
                      {tagFor(d, c)}
                    </Text>
                  </Pressable>
                  <IconButton
                    look="soft"
                    icon="edit"
                    accessibilityLabel={t('plan.editDay', { name: d.name })}
                    onPress={() =>
                      router.push({
                        pathname: '/plan-day/[dayId]',
                        params: { dayId: d.id, planId: p.id },
                      })
                    }
                  />
                  {!isNext ? (
                    <IconButton
                      look="soft"
                      icon="play"
                      accessibilityLabel={t('plan.startNow', { name: d.name })}
                      disabled={d.exercises.length === 0}
                      onPress={() => startDay(p, d, rotation)}
                    />
                  ) : null}
                </View>
                {d.exercises.length === 0 ? (
                  <Text variant="bodyS" muted>
                    {t('plan.noExercises')}
                  </Text>
                ) : (
                  <ExerciseChips {...exerciseChips(d)} />
                )}
                {isNext ? (
                  <Button
                    label={t('plan.startDay', { name: d.name })}
                    icon="play"
                    disabled={d.exercises.length === 0}
                    onPress={() => startDay(p, d, rotation)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('plan.addDay')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/plan-day/[dayId]',
                  params: { dayId: 'new', planId: p.id, isNew: '1' },
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('plan.emptyWorkout')}
              variant="secondary"
              onPress={() => startEmpty(t('train.emptyWorkout'))}
            />
          </View>
        </View>
      </Screen>

      <PlanSheets plan={p} sheet={sheet} setSheet={setSheet} />
    </>
  );
}

/** Options of a plan (set active, rename, duplicate, archive, delete), as bottom sheets. */
export function PlanSheets({
  plan,
  sheet,
  setSheet,
  onDuplicated,
  onDeleted,
}: {
  plan: PlanView;
  sheet: SheetKind;
  setSheet: (s: SheetKind) => void;
  /** Default: open the copy. */
  onDuplicated?: (id: string) => void;
  /** Default: leave the plan page. */
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const updatePlan = useUpdatePlan();
  const setStatus = useSetPlanStatus();
  const duplicate = useDuplicatePlan();
  const deletePlan = useDeletePlan();
  const [name, setName] = useState(plan.name);
  const close = () => setSheet(null);

  return (
    <>
      <Sheet
        visible={sheet === 'menu'}
        onClose={close}
        title={plan.name}
        closeLabel={t('common.close')}
      >
        {plan.status !== 'active' ? (
          <Button
            label={t('plan.setActive')}
            variant="secondary"
            onPress={async () => {
              await setStatus.mutateAsync({ id: plan.id, status: 'active' });
              close();
            }}
          />
        ) : null}
        <Button
          label={t('plan.rename')}
          variant="secondary"
          onPress={() => {
            setName(plan.name);
            setSheet('rename');
          }}
        />
        <Button
          label={t('plan.duplicate')}
          variant="secondary"
          icon="copy"
          onPress={async () => {
            const id = await duplicate.mutateAsync({
              plan,
              name: t('plan.copyName', { name: plan.name }),
            });
            close();
            if (onDuplicated) onDuplicated(id);
            else router.replace({ pathname: '/train/plan/[planId]', params: { planId: id } });
          }}
        />
        {plan.status !== 'archived' ? (
          <Button
            label={t('plan.archive')}
            variant="secondary"
            icon="archive"
            onPress={async () => {
              await setStatus.mutateAsync({ id: plan.id, status: 'archived' });
              close();
            }}
          />
        ) : null}
        <Button
          label={t('plan.deletePlan')}
          variant="danger"
          onPress={() => setSheet('deletePlan')}
        />
      </Sheet>

      <Sheet
        visible={sheet === 'rename'}
        onClose={close}
        title={t('plan.rename')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('common.save')}
            disabled={name.trim() === '' || updatePlan.isPending}
            onPress={async () => {
              await updatePlan.mutateAsync({ id: plan.id, name });
              close();
            }}
          />
        }
      >
        <Input label={t('train.planName')} value={name} onChangeText={setName} autoFocus />
      </Sheet>

      <Sheet
        visible={sheet === 'deletePlan'}
        onClose={close}
        title={t('plan.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('plan.deleteConfirm')}
            onPress={async () => {
              await deletePlan.mutateAsync(plan.id);
              close();
              if (onDeleted) onDeleted();
              else goBack(router, '/train');
            }}
          />
        }
      >
        <Text muted>{t('plan.deleteBody')}</Text>
      </Sheet>
    </>
  );
}
