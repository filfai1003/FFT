import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { InfoButton } from '@/components/ui/InfoButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/ui/Icon';
import { DragHandle, moveActionDelta, useReorder } from '@/components/ui/reorder';
import { supersetLabels } from '@/domain/superset';
import { MAX_DROPS, type DropPlan } from '@/domain/dropset';
import { Segmented } from '@/components/ui/Segmented';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import {
  moveInDay,
  moveInDayTo,
  nextPosition,
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
  const reorder = useReorder(
    (state?.exercises ?? []).map((e) => e.id),
    (from, to) => patch((s) => moveInDayTo(s, from, to)),
    8,
  );

  // Load once per opening. The picker adds to the same store, so re-opening must not reset it.
  useEffect(() => {
    if (!plan.data) return;
    const current = useDayEditorStore.getState().state;
    if (isNew === '1') {
      // A new day has no id in the URL: it is "the new day of this plan being edited".
      if (current?.isNew && current.planId === plan.data.id) return;
      setState(
        openNewDay(
          plan.data.id,
          nextPosition(plan.data.days),
          t('plan.newDayName', { n: plan.data.days.length + 1 }),
        ),
      );
      return;
    }
    if (current?.dayId === dayId) return;
    const day = plan.data.days.find((d) => d.id === dayId);
    if (day) setState(openDay(plan.data.id, day, day.position));
  }, [plan.data, dayId, isNew, setState, t]);

  useEffect(() => () => setState(null), [setState]);

  const showing = isNew === '1' ? state?.isNew === true : state?.dayId === dayId;
  if (!state || !showing || !plan.data) return <Screen>{null}</Screen>;

  const valid = state.name.trim().length > 0;
  const labels = supersetLabels(
    state.exercises.map((e, i) => e.supersetWithNext && i < state.exercises.length - 1),
  );
  const subtitle = `${plan.data.name} · ${t('plan.dayN', { n: state.position + 1 })}`;

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
      goBack(router, '/train');
    } catch {
      // A sentence that says how to fix it, not the database's message (DECISIONS 124).
      setError(t('forms.saveFailed'));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={16}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router, '/train') }}
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
          <Text variant="bodyS" muted>
            {t('plan.exercisesCount', { count: state.exercises.length })}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {state.exercises.map((e, index) => {
            const row = reorder.rowProps(index);
            return (
              <View
                key={e.id}
                onLayout={row.onLayout}
                style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }, row.style]}
              >
                {/* Hold the grip, then slide the exercise to its new place. */}
                <DragHandle
                  {...reorder.handleProps(index)}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={t('plan.reorderLabel', { name: e.exercise.name })}
                  accessibilityHint={t('plan.reorderHint')}
                  accessibilityActions={[
                    { name: 'decrement', label: t('plan.moveUp') },
                    { name: 'increment', label: t('plan.moveDown') },
                  ]}
                  onAccessibilityAction={(ev) =>
                    patch((s) => moveInDay(s, e.id, moveActionDelta(ev.nativeEvent.actionName)))
                  }
                  style={{
                    width: 32,
                    minHeight: 60,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="grip" size={20} color={colors.textMuted} />
                </DragHandle>
                <View style={{ flex: 1 }}>
                  {state.expandedId === e.id ? (
                    <ExpandedExercise
                      e={e}
                      label={labels[index]}
                      canLink={index < state.exercises.length - 1}
                      onChange={(p) => patch((s) => updateInDay(s, e.id, p))}
                      onRemove={() => patch((s) => removeFromDay(s, e.id))}
                      onCollapse={() => patch((s) => ({ ...s, expandedId: null }))}
                    />
                  ) : (
                    <Pressable
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
                        <Text variant="bodyS" muted>
                          {[
                            labels[index]
                              ? t('plan.supersetLabel', { label: labels[index] })
                              : null,
                            t('plan.summary', summaryLine(e)),
                            e.drops?.reps.length
                              ? t('plan.dropSummary', { count: e.drops.reps.length })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
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
              goBack(router, '/train');
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
  /** "A1" when it is in a superset. */
  label: string | null;
  /** Not the last exercise: it can be linked with the next one. */
  canLink: boolean;
  onChange: (
    p: Partial<
      Pick<
        DayDraftExercise,
        'targetSets' | 'targetReps' | 'restS' | 'notes' | 'supersetWithNext' | 'drops'
      >
    >,
  ) => void;
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="bodyS" muted>
              {t('plan.sets')}
            </Text>
            <InfoButton topic="setsReps" />
          </View>
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
        <Text variant="bodyS" muted>
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

      {e.exercise.logType === 'weight_reps' ? (
        <DropSetEditor drops={e.drops} onChange={(drops) => props.onChange({ drops })} />
      ) : null}

      {props.canLink ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ flexShrink: 1 }}>{t('plan.supersetToggle')}</Text>
              <InfoButton topic="superset" />
            </View>
            <Text variant="bodyS" muted>
              {props.label
                ? t('plan.supersetDetailOn', { label: props.label })
                : t('plan.supersetDetail')}
            </Text>
          </View>
          <Toggle
            value={e.supersetWithNext}
            onValueChange={(v) => props.onChange({ supersetWithNext: v })}
            accessibilityLabel={t('plan.supersetToggle')}
          />
        </View>
      ) : null}

      <Input
        accessibilityLabel={t('plan.note')}
        placeholder={t('plan.notePlaceholder')}
        value={e.notes}
        onChangeText={(v) => props.onChange({ notes: v })}
      />
    </Card>
  );
}

/** Drop set of a plan exercise: off, after the last set or after every set; target reps per drop. */
function DropSetEditor({
  drops,
  onChange,
}: {
  drops: DropPlan | null;
  onChange: (drops: DropPlan | null) => void;
}) {
  const { t } = useTranslation();
  const mode = drops ? drops.on : 'off';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text variant="bodyS" muted>
          {t('plan.dropSet')}
        </Text>
        <InfoButton topic="dropSet" />
      </View>
      <Segmented
        accessibilityLabel={t('plan.dropSet')}
        value={mode}
        onChange={(v) =>
          onChange(v === 'off' ? null : { on: v, reps: drops?.reps.length ? drops.reps : ['10'] })
        }
        options={[
          { value: 'off', label: t('plan.dropOff') },
          { value: 'last', label: t('plan.dropLast') },
          { value: 'every', label: t('plan.dropEvery') },
        ]}
      />
      {drops ? (
        <>
          {drops.reps.map((r, k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  variant="compact"
                  label={t('plan.dropReps', { n: k + 1 })}
                  value={r}
                  placeholder="10"
                  onChangeText={(v) =>
                    onChange({ ...drops, reps: drops.reps.map((x, i) => (i === k ? v : x)) })
                  }
                />
              </View>
              <IconButton
                icon="close"
                accessibilityLabel={t('plan.removeDrop', { n: k + 1 })}
                onPress={() => {
                  const reps = drops.reps.filter((_, i) => i !== k);
                  onChange(reps.length ? { ...drops, reps } : null);
                }}
              />
            </View>
          ))}
          {drops.reps.length < MAX_DROPS ? (
            <Button
              variant="ghost"
              label={t('plan.addDrop')}
              icon="plus"
              onPress={() =>
                onChange({
                  ...drops,
                  reps: [...drops.reps, drops.reps[drops.reps.length - 1] ?? '10'],
                })
              }
            />
          ) : null}
          <Text variant="bodyS" muted>
            {drops.on === 'every' ? t('plan.dropEveryDetail') : t('plan.dropLastDetail')}
          </Text>
        </>
      ) : null}
    </View>
  );
}
