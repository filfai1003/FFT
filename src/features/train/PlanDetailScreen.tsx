import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { Translate } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone, localDay, weekdayName } from '@/domain/day';
import { useStartWorkout } from '@/features/session/start';
import {
  dayPreview,
  useDeletePlan,
  useDuplicatePlan,
  usePlan,
  useRotation,
  useSetPlanStatus,
  useUpdatePlan,
  type PlanDayView,
  type PlanView,
  type Rotation,
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

  if (!plan.data) return <Screen>{null}</Screen>;
  const p = plan.data;
  const active = p.status === 'active';

  const tagFor = (d: PlanDayView): string => {
    if (rotation?.state.upNextDayId === d.id) return t('plan.tagUpNext');
    const done = rotation?.doneThisCycle.get(d.id);
    if (done) {
      const weekday = weekdayName(localDay(new Date(done.started_at), deviceTimeZone())).slice(
        0,
        3,
      );
      return done.out_of_order ? t('plan.tagDoneOut', { weekday }) : t('plan.tagDone', { weekday });
    }
    return active ? t('plan.tagThisCycle') : t('plan.tagNotDone');
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

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {active ? (
              <View
                style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
              />
            ) : null}
            <Text variant="label" muted>
              {headerLine(p, rotation, t as Translate)}
            </Text>
          </View>
          <Text variant="screenTitle" accessibilityRole="header">
            {p.name}
          </Text>
          <Text variant="bodyS" muted>
            {t('plan.anyDay')}
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          {p.days.map((d, index) => {
            const isNext = rotation?.state.upNextDayId === d.id;
            const preview = dayPreview(d);
            return (
              <View
                key={d.id}
                style={{
                  borderRadius: radius.cardSmall,
                  borderWidth: 1,
                  borderColor: isNext ? colors.borderSelected : colors.borderDecorative,
                  backgroundColor: isNext ? colors.surface : colors.surfaceAlt,
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 16,
                  paddingRight: 8,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="displayS" numeric style={{ width: 24 }}>
                    {index + 1}
                  </Text>
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
                    <Text variant="bodyL" medium>
                      {d.name}
                    </Text>
                    <Text variant="label" muted>
                      {tagFor(d)}
                    </Text>
                    <Text variant="bodyS" muted numberOfLines={2}>
                      {d.exercises.length === 0
                        ? t('plan.noExercises')
                        : preview.more > 0
                          ? `${preview.names.join(', ')}, +${preview.more}`
                          : preview.names.join(', ')}
                    </Text>
                  </Pressable>
                  <IconButton
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
                      icon="play"
                      accessibilityLabel={t('plan.startNow', { name: d.name })}
                      disabled={d.exercises.length === 0}
                      onPress={() => startDay(p, d, rotation)}
                    />
                  ) : null}
                </View>
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

function headerLine(p: PlanView, rotation: Rotation | null, t: Translate) {
  const status = t(`train.status.${p.status}`);
  const days = t('plan.daysCount', { count: p.days.length });
  return p.status === 'active' && rotation
    ? `${status} · ${days} · ${t('train.cycle', { n: rotation.state.cycle })}`
    : `${status} · ${days}`;
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
