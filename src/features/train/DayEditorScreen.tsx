import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import {
  moveInDay,
  openDay,
  openNewDay,
  removeFromDay,
  summaryLine,
  updateInDay,
  useDayEditorStore,
} from './day-editor';
import { ExerciseThumb } from './exercise-image';
import { useDeleteDay, usePlan, useSaveDay, type DayDraftExercise } from './plans';
import { Sheet } from '@/components/ui/Sheet';
import { goBack } from '@/lib/navigation';

/** Edit one day of a plan: name, exercises, sets / reps / rest of each. */
export function DayEditorScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const { dayId, planId, isNew } = useLocalSearchParams<{
    dayId: string;
    planId: string;
    isNew?: string;
  }>();
  const plan = usePlan(planId);
  const state = useDayEditorStore((s) => s.state);
  const setState = useDayEditorStore((s) => s.set);
  const patch = useDayEditorStore((s) => s.patch);
  const save = useSaveDay();
  const deleteDay = useDeleteDay();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load once per opening. The picker adds to the same store, so re-opening must not reset it.
  useEffect(() => {
    if (!plan.data) return;
    const current = useDayEditorStore.getState().state;
    if (current?.dayId === dayId) return;
    if (isNew === '1') {
      setState(
        openNewDay(
          plan.data.id,
          plan.data.days.length,
          t('plan.newDayName', { n: plan.data.days.length + 1 }),
        ),
      );
      return;
    }
    const day = plan.data.days.find((d) => d.id === dayId);
    if (day) setState(openDay(plan.data.id, day, day.position));
  }, [plan.data, dayId, isNew, setState, t]);

  useEffect(() => () => setState(null), [setState]);

  if (!state || state.dayId !== dayId || !plan.data) return <Screen>{null}</Screen>;

  const valid = state.name.trim().length > 0;
  const subtitle = `${plan.data.name} · ${t('plan.dayN', { n: state.position + 1 })}`.toUpperCase();

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        planId: state.planId,
        dayId: state.dayId,
        position: state.position,
        name: state.name,
        exercises: state.exercises,
        removedIds: state.removedIds,
      });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={16}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={subtitle}
        />

        <Input
          label={t('plan.dayName')}
          value={state.name}
          onChangeText={(name) => patch((s) => ({ ...s, name }))}
          display
          autoCapitalize="words"
        />

        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="label" muted>
            {t('plan.exercisesCount', { count: state.exercises.length })}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {state.exercises.map((e, index) =>
            state.expandedId === e.id ? (
              <ExpandedExercise
                key={e.id}
                e={e}
                canUp={index > 0}
                canDown={index < state.exercises.length - 1}
                onChange={(p) => patch((s) => updateInDay(s, e.id, p))}
                onMove={(d) => patch((s) => moveInDay(s, e.id, d))}
                onRemove={() => patch((s) => removeFromDay(s, e.id))}
                onCollapse={() => patch((s) => ({ ...s, expandedId: null }))}
              />
            ) : (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={e.exercise.name}
                accessibilityHint={t('plan.editExerciseHint')}
                onPress={() => patch((s) => ({ ...s, expandedId: e.id }))}
                style={({ pressed }) => ({
                  minHeight: 60,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  borderRadius: radius.row + 2,
                  borderWidth: 1,
                  borderColor: colors.borderDecorative,
                  backgroundColor: colors.surfaceAlt,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <ExerciseThumb exercise={e.exercise} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" numberOfLines={1}>
                    {e.exercise.name}
                  </Text>
                  <Text variant="label" muted>
                    {t('plan.summary', summaryLine(e))}
                  </Text>
                </View>
              </Pressable>
            ),
          )}
        </View>

        <Button
          label={t('plan.addExercise')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/exercise-picker', params: { target: 'day' } })}
        />
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {!state.isNew ? (
          <Button
            label={t('plan.deleteDay')}
            variant="danger"
            onPress={() => setConfirmDelete(true)}
          />
        ) : null}
      </Screen>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('plan.deleteDayTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('plan.deleteDayConfirm')}
            onPress={async () => {
              await deleteDay.mutateAsync(state.dayId);
              setConfirmDelete(false);
              goBack(router);
            }}
          />
        }
      >
        <Text muted>{t('plan.deleteDayBody')}</Text>
      </Sheet>

      <BottomActionBar>
        <Button
          size="large"
          label={t('plan.saveDay')}
          disabled={!valid || save.isPending}
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}

function ExpandedExercise(props: {
  e: DayDraftExercise;
  canUp: boolean;
  canDown: boolean;
  onChange: (
    p: Partial<Pick<DayDraftExercise, 'targetSets' | 'targetReps' | 'restS' | 'notes'>>,
  ) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onCollapse: () => void;
}) {
  const { t } = useTranslation();
  const { e } = props;
  return (
    <Card size="small" selected gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExerciseThumb exercise={e.exercise} size={40} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('plan.collapse', { name: e.exercise.name })}
          onPress={props.onCollapse}
          style={{ flex: 1, minHeight: touch.minTarget, justifyContent: 'center' }}
        >
          <Text variant="body" medium numberOfLines={1}>
            {e.exercise.name}
          </Text>
        </Pressable>
        <IconButton
          icon="trash"
          accessibilityLabel={t('plan.removeExercise', { name: e.exercise.name })}
          onPress={props.onRemove}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="label" muted>
            {t('plan.sets')}
          </Text>
          <Stepper
            value={e.targetSets}
            min={1}
            max={20}
            onChange={(v) => props.onChange({ targetSets: v })}
            decreaseLabel={t('plan.fewerSets')}
            increaseLabel={t('plan.moreSets')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            variant="compact"
            label={t('plan.reps')}
            value={e.targetReps}
            onChangeText={(v) => props.onChange({ targetReps: v })}
            placeholder="8-12"
          />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {t('plan.rest')}
        </Text>
        <Stepper
          value={e.restS}
          min={0}
          max={600}
          step={15}
          format={(s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
          onChange={(v) => props.onChange({ restS: v })}
          decreaseLabel={t('plan.lessRest')}
          increaseLabel={t('plan.moreRest')}
        />
      </View>

      <Input
        accessibilityLabel={t('plan.note')}
        placeholder={t('plan.notePlaceholder')}
        value={e.notes}
        onChangeText={(v) => props.onChange({ notes: v })}
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            label={t('plan.moveUp')}
            icon="arrowUp"
            disabled={!props.canUp}
            onPress={() => props.onMove(-1)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            label={t('plan.moveDown')}
            icon="arrowDown"
            disabled={!props.canDown}
            onPress={() => props.onMove(1)}
          />
        </View>
      </View>
    </Card>
  );
}
