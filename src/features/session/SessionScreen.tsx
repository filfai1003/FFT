import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useAppearanceStore } from '@/design/appearance-store';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { ExerciseThumb } from '@/features/train/exercise-image';
import { usePlan } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { useNow } from '@/lib/use-now';
import { FinishSheet } from './FinishSheet';
import { RestCard } from './RestCard';
import { afterSetInSuperset, supersetLabels } from '@/domain/superset';
import { SuggestionCard } from './SuggestionCard';
import { SetRow, columnsFor } from './SetRow';
import {
  addSet,
  exerciseState,
  formatClock,
  goTo,
  keepLastWeight,
  moveExercise,
  removeExercise,
  removeSet,
  setField,
  startRest,
  toggleSet,
  restoreExercise,
  undoSetDone,
  type SetField,
} from './logic';
import { useSessionHydrated, useSessionStore } from './store';
import { goBack } from '@/lib/navigation';

const BOTTOM_NAV_HEIGHT = 56 + 34 + 24;

export function SessionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const hydrated = useSessionHydrated();
  const active = useSessionStore((s) => s.active);
  const update = useSessionStore((s) => s.update);
  const oneHand = useAppearanceStore((s) => s.oneHandMode);
  const showToast = useToastStore((s) => s.show);
  const now = useNow(1000, active != null);
  const [finishing, setFinishing] = useState(false);
  const [menu, setMenu] = useState(false);
  // Planned reps also for workouts started before they were saved in the session.
  const plan = usePlan(active?.planId ?? undefined);

  if (!hydrated) return <Screen>{null}</Screen>;
  if (!active || active.id !== sessionId) {
    // Finished, discarded or never existed: nothing to show here.
    return (
      <Screen gap={16}>
        <Text variant="screenTitle">{t('session.noneTitle')}</Text>
        <Text muted>{t('session.noneBody')}</Text>
        <Button label={t('session.backToTrain')} onPress={() => router.replace('/train')} />
      </Screen>
    );
  }

  const elapsed = Math.max(0, Math.round((now - new Date(active.startedAt).getTime()) / 1000));
  const index = Math.min(active.index, Math.max(active.exercises.length - 1, 0));
  const exercise = active.exercises[index];
  // An empty workout has no exercise: never read through `exercise` unguarded (the compiler may hoist it).
  const sets = exercise?.sets ?? [];
  const exerciseName = exercise?.name ?? '';
  const targetReps =
    exercise?.targetReps ??
    plan.data?.days
      .find((d) => d.id === active.planDayId)
      ?.exercises.find((e) => e.exerciseId === exercise?.exerciseId)
      ?.targetReps.trim();
  const labels = supersetLabels(active.exercises.map((e) => e.supersetWithNext ?? false));
  const supersetLabel = labels[index];
  const previousEx = active.exercises[index - 1];
  const nextEx = active.exercises[index + 1];

  const minimize = () => (router.canGoBack() ? goBack(router) : router.replace('/train'));

  const onChange = (setIndex: number, field: SetField, value: string) =>
    update((s) => setField(s, index, setIndex, field, value));

  const onToggle = (setIndex: number) => {
    const before = useSessionStore.getState().active!;
    const setId = before.exercises[index].sets[setIndex].id;
    const { session, completed } = toggleSet(before, index, setIndex, new Date());
    // In a superset: straight to the next exercise of the round, rest only after the last one.
    const flow = completed
      ? afterSetInSuperset(
          session.exercises.map((e) => e.supersetWithNext ?? false),
          index,
          session.exercises.map((e) => e.sets.filter((x) => !x.done).length),
        )
      : null;
    let next = session;
    if (flow?.rest) next = startRest(next, before.exercises[index].restS, Date.now());
    if (flow?.goTo != null) next = goTo(next, flow.goTo);
    update(() => next);
    if (completed) {
      confirm();
      showToast({
        message: t('session.setSaved', { n: setIndex + 1 }),
        actionLabel: t('common.undo'),
        bottomOffset: BOTTOM_NAV_HEIGHT,
        onAction: () => update((s) => undoSetDone(s, setId)),
      });
    }
  };

  const columns = columnsFor(exercise?.logType ?? 'weight_reps', active.weightUnit);
  const openPicker = () =>
    router.push({ pathname: '/exercise-picker', params: { target: 'session' } });
  // The big button: tick the next set, then move on, then finish.
  const nextSet = sets.findIndex((x) => !x.done);
  const primaryKind = !exercise ? 'add' : nextSet >= 0 ? 'set' : nextEx ? 'next' : 'finish';
  const primary = {
    label:
      primaryKind === 'add'
        ? t('session.addExercise')
        : primaryKind === 'set'
          ? t('session.doneSet', { n: nextSet + 1 })
          : primaryKind === 'next'
            ? t('session.nextExercise')
            : t('session.finish'),
    info:
      primaryKind === 'set'
        ? columns
            .map((c) => sets[nextSet]![c.field])
            .filter(Boolean)
            .join(' × ')
        : primaryKind === 'next'
          ? (nextEx?.name ?? '')
          : '',
  };
  function runPrimary() {
    if (primaryKind === 'add') openPicker();
    else if (primaryKind === 'set') onToggle(nextSet);
    else if (primaryKind === 'next') update((x) => goTo(x, index + 1));
    else setFinishing(true);
  }

  return (
    <>
      <Screen scroll bottomBarHeight={BOTTOM_NAV_HEIGHT + 24} gap={16}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="chevronDown"
            accessibilityLabel={t('session.minimize')}
            onPress={minimize}
          />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label" muted numberOfLines={1}>
              {t('session.header', { name: active.dayName })}
            </Text>
            <Text variant="displayS" numeric>
              {formatClock(elapsed)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('session.finish')}
            onPress={() => setFinishing(true)}
            style={({ pressed }) => ({
              height: touch.minTarget,
              paddingHorizontal: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.borderControl,
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="bodyS" medium>
              {t('session.finish')}
            </Text>
          </Pressable>
        </View>

        {active.exercises.length > 0 ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('session.progress', {
              current: index + 1,
              total: active.exercises.length,
            })}
            style={{ flexDirection: 'row', gap: 4 }}
          >
            {active.exercises.map((e, i) => (
              <View
                key={e.rowId}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    i === index
                      ? colors.accent
                      : exerciseState(e) === 'done'
                        ? colors.dotOn
                        : colors.dotOff,
                }}
              />
            ))}
          </View>
        ) : null}

        {exercise ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ExerciseThumb
                exercise={{ ownerId: null, imagePath: exercise.imagePath }}
                size={52}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="label" muted>
                  {t('session.exerciseOf', { current: index + 1, total: active.exercises.length })}
                </Text>
                <Text variant="titleM" accessibilityRole="header">
                  {exercise.name}
                </Text>
                {targetReps || supersetLabel ? (
                  <Text variant="label" muted>
                    {[
                      supersetLabel ? t('session.superset', { label: supersetLabel }) : null,
                      targetReps
                        ? t('session.targetReps', { reps: targetReps.replace('-', '–') })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="info"
                accessibilityLabel={t('session.details')}
                onPress={() =>
                  router.push({
                    pathname: '/train/exercise/[exerciseId]',
                    params: { exerciseId: exercise.exerciseId, fromSession: active.id },
                  })
                }
              />
              <IconButton
                icon="more"
                accessibilityLabel={t('session.exerciseMenu')}
                onPress={() => setMenu(true)}
              />
            </View>

            <SuggestionCard
              exercise={exercise}
              unit={active.weightUnit}
              onKeep={(keep) => update((s) => keepLastWeight(s, index, keep))}
            />

            <Card size="small" gap={0}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
                <Text variant="label" muted style={{ width: 30 }}>
                  {t('session.colSet')}
                </Text>
                <Text variant="label" muted style={{ flex: 1 }}>
                  {t('session.colPrevious')}
                </Text>
                {columns.map((c) => (
                  <Text
                    key={c.field}
                    variant="label"
                    muted
                    style={{
                      width: c.field === 'weight' || c.field === 'distance' ? 70 : 60,
                      textAlign: 'center',
                    }}
                  >
                    {c.label}
                  </Text>
                ))}
                <View style={{ width: oneHand ? 56 : 44 }} />
              </View>
              {sets.map((set, i) => (
                <SetRow
                  key={set.id}
                  index={i}
                  set={set}
                  columns={columns}
                  large={oneHand}
                  onChange={onChange}
                  onToggle={onToggle}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('session.addSet')}
                onPress={() => update((s) => addSet(s, index))}
                style={({ pressed }) => ({
                  height: touch.minTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text variant="label" muted>
                  {t('session.addSetLabel')}
                </Text>
              </Pressable>
            </Card>

            <RestCard />
          </>
        ) : (
          <Card gap={12}>
            <Text variant="titleM">{t('session.emptyTitle')}</Text>
            <Text muted>{t('session.emptyBody')}</Text>
            <Button
              label={t('session.addExercise')}
              onPress={() =>
                router.push({ pathname: '/exercise-picker', params: { target: 'session' } })
              }
            />
          </Card>
        )}
      </Screen>

      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t('session.switch')}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 34,
          flexDirection: 'row',
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: colors.borderDecorative,
          backgroundColor: colors.bg,
        }}
      >
        <NavButton
          label={
            previousEx
              ? t('session.previousNamed', { name: previousEx.name })
              : t('session.previous')
          }
          icon="chevronLeft"
          disabled={!previousEx}
          onPress={() => update((s) => goTo(s, index - 1))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primary.info ? `${primary.label}, ${primary.info}` : primary.label}
          onPress={runPrimary}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 56,
            borderRadius: 16,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text variant="bodyL" style={{ color: colors.onAccent, fontWeight: '700' }}>
            {primary.label}
          </Text>
          {primary.info ? (
            <Text
              variant="bodyS"
              numberOfLines={1}
              style={{ color: colors.onAccent, opacity: 0.9 }}
            >
              {primary.info}
            </Text>
          ) : null}
        </Pressable>
        <NavButton
          label={nextEx ? t('session.nextNamed', { name: nextEx.name }) : t('session.addExercise')}
          icon={nextEx ? 'chevronRight' : 'plus'}
          disabled={!exercise}
          onPress={() => (nextEx ? update((s) => goTo(s, index + 1)) : openPicker())}
        />
      </View>

      <FinishSheet visible={finishing} onClose={() => setFinishing(false)} />

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={exerciseName}
        closeLabel={t('common.close')}
      >
        <Button
          label={t('session.removeLastSet')}
          variant="secondary"
          disabled={sets.length <= 1}
          onPress={() => {
            update((s) => removeSet(s, index, sets.length - 1));
            setMenu(false);
          }}
        />
        <Button
          label={t('session.moveEarlier')}
          variant="secondary"
          icon="arrowUp"
          disabled={index === 0}
          onPress={() => {
            update((s) => moveExercise(s, index, index - 1));
            setMenu(false);
          }}
        />
        <Button
          label={t('session.moveLater')}
          variant="secondary"
          icon="arrowDown"
          disabled={index >= active.exercises.length - 1}
          onPress={() => {
            update((s) => moveExercise(s, index, index + 1));
            setMenu(false);
          }}
        />
        <Button
          label={t('session.removeExercise')}
          variant="danger"
          disabled={!exercise}
          onPress={() => {
            const removed = exercise;
            const position = index;
            update((s) => removeExercise(s, index));
            setMenu(false);
            showToast({
              message: t('session.exerciseRemoved', { name: exerciseName }),
              actionLabel: t('common.undo'),
              bottomOffset: BOTTOM_NAV_HEIGHT,
              onAction: () => update((s) => restoreExercise(s, removed, position)),
            });
          }}
        />
      </Sheet>
    </>
  );
}

/** A square side button of the bottom bar (previous / next exercise). */
function NavButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight' | 'plus';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}
