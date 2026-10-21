import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
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
import { ExerciseSwiper } from './ExerciseSwiper';
import { FinishSheet } from './FinishSheet';
import { RestCard } from './RestCard';
import { ReorderSheet } from './ReorderSheet';
import { SwapSheet } from './SwapSheet';
import { supersetLabels, supersetOf } from '@/domain/superset';
import { SuggestionCard } from './SuggestionCard';
import { SetRow, columnsFor } from './SetRow';
import {
  addSet,
  doingIndex,
  exerciseState,
  formatClock,
  goTo,
  keepLastWeight,
  removeExercise,
  removeSet,
  setDropField,
  setField,
  toggleInRound,
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
  const [reordering, setReordering] = useState(false);
  const [swapping, setSwapping] = useState(false);
  // Planned reps also for workouts started before they were saved in the session.
  const plan = usePlan(active?.planId ?? undefined);

  if (!hydrated) return <Screen>{null}</Screen>;
  if (!active || active.id !== sessionId) {
    // Finished, discarded or never existed: nothing to show here.
    return (
      <Screen gap={16}>
        <EmptyState
          icon="dumbbell"
          area="training"
          title={t('session.noneTitle')}
          body={t('session.noneBody')}
          action={{ label: t('session.backToTrain'), onPress: () => router.replace('/train') }}
          actionVariant="primary"
        />
      </Screen>
    );
  }

  const elapsed = Math.max(0, Math.round((now - new Date(active.startedAt).getTime()) / 1000));
  const index = Math.min(active.index, Math.max(active.exercises.length - 1, 0));
  const exercise = active.exercises[index];
  // An empty workout has no exercise: never read through `exercise` unguarded (the compiler may hoist it).
  const sets = exercise?.sets ?? [];
  const exerciseName = exercise?.name ?? '';
  const links = active.exercises.map((e) => e.supersetWithNext ?? false);
  const labels = supersetLabels(links);
  // A superset is shown whole (its exercises one under the other) and done in turn.
  const group = active.exercises.length > 0 ? supersetOf(links, index) : [];
  const inSuperset = group.length > 1;
  // The exercise whose set comes next: this one, else the next of the round that has sets left.
  const doing = doingIndex(active, index);
  const previousEx = active.exercises[(group[0] ?? index) - 1];
  const nextEx = active.exercises[(group[group.length - 1] ?? index) + 1];
  const previousIndex = (group[0] ?? index) - 1;
  const nextIndex = (group[group.length - 1] ?? index) + 1;
  const targetRepsOf = (i: number) => {
    const e = active.exercises[i];
    return (
      e?.targetReps ??
      plan.data?.days
        .find((d) => d.id === active.planDayId)
        ?.exercises.find((x) => x.exerciseId === e?.exerciseId)
        ?.targetReps.trim()
    );
  };

  const minimize = () => (router.canGoBack() ? goBack(router) : router.replace('/train'));

  const onChange = (setIndex: number, field: SetField, value: string, at = index) =>
    update((s) => setField(s, at, setIndex, field, value));

  const onToggle = (setIndex: number, at = index) => {
    const before = useSessionStore.getState().active!;
    const setId = before.exercises[at].sets[setIndex].id;
    const { next, completed } = toggleInRound(before, at, setIndex, new Date());
    update(() => next);
    if (completed) {
      confirm();
      showToast({
        message: labels[at]
          ? t('session.setSavedIn', { n: setIndex + 1, label: labels[at] })
          : t('session.setSaved', { n: setIndex + 1 }),
        actionLabel: t('common.undo'),
        bottomOffset: BOTTOM_NAV_HEIGHT,
        onAction: () => update((s) => undoSetDone(s, setId)),
      });
    }
  };

  const openPicker = () =>
    router.push({ pathname: '/exercise-picker', params: { target: 'session' } });
  // The big button: tick the next set, then move on, then finish.
  const doingSets = active.exercises[doing]?.sets ?? sets;
  const nextSet = doingSets.findIndex((x) => !x.done);
  const primaryKind = !exercise ? 'add' : nextSet >= 0 ? 'set' : nextEx ? 'next' : 'finish';
  const primary = {
    label:
      primaryKind === 'add'
        ? t('session.addExercise')
        : primaryKind === 'set'
          ? labels[doing]
            ? t('session.doneSetIn', { n: nextSet + 1, label: labels[doing] })
            : t('session.doneSet', { n: nextSet + 1 })
          : primaryKind === 'next'
            ? t('session.nextExercise')
            : t('session.finish'),
    info:
      primaryKind === 'set'
        ? columnsFor(active.exercises[doing]?.logType ?? 'weight_reps', active.weightUnit)
            .map((c) => doingSets[nextSet]![c.field])
            .filter(Boolean)
            .join(' × ')
        : primaryKind === 'next'
          ? (nextEx?.name ?? '')
          : '',
  };
  function runPrimary() {
    if (primaryKind === 'add') openPicker();
    else if (primaryKind === 'set') onToggle(nextSet, doing);
    else if (primaryKind === 'next') update((x) => goTo(x, nextIndex));
    else setFinishing(true);
  }

  function renderExercise(i: number) {
    const e = active!.exercises[i];
    const reps = targetRepsOf(i);
    const label = labels[i];
    const cols = columnsFor(e.logType, active!.weightUnit);
    const current = inSuperset && i === doing;
    const body = (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ExerciseThumb
            exercise={{ ownerId: null, imagePath: e.imagePath }}
            size={inSuperset ? 44 : 52}
          />
          <Pressable
            accessibilityRole={inSuperset ? 'button' : undefined}
            disabled={!inSuperset || i === index}
            onPress={() => update((s) => goTo(s, i))}
            style={{ flex: 1, gap: 4 }}
          >
            <Text variant="label" muted>
              {t('session.exerciseOf', { current: i + 1, total: active!.exercises.length })}
            </Text>
            <Text
              variant={inSuperset ? 'body' : 'titleM'}
              medium={inSuperset}
              accessibilityRole="header"
            >
              {label ? `${label} · ${e.name}` : e.name}
            </Text>
            {reps ? (
              <Text variant="label" muted>
                {t('session.targetReps', { reps: reps.replace('-', '–') })}
              </Text>
            ) : null}
          </Pressable>
          <IconButton
            icon="info"
            accessibilityLabel={t('session.details')}
            onPress={() =>
              router.push({
                pathname: '/train/exercise/[exerciseId]',
                params: { exerciseId: e.exerciseId, fromSession: active!.id },
              })
            }
          />
          <IconButton
            icon="more"
            accessibilityLabel={t('session.exerciseMenu')}
            onPress={() => {
              if (i !== index) update((s) => goTo(s, i));
              setMenu(true);
            }}
          />
        </View>

        <SuggestionCard
          exercise={e}
          unit={active!.weightUnit}
          onKeep={(keep) => update((s) => keepLastWeight(s, i, keep))}
        />

        <Card size="small" gap={0}>
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
            <Text variant="label" muted style={{ width: 30 }}>
              {t('session.colSet')}
            </Text>
            <Text variant="label" muted style={{ flex: 1 }}>
              {t('session.colPrevious')}
            </Text>
            {cols.map((c) => (
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
          {e.sets.map((set, k) => (
            <SetRow
              key={set.id}
              index={k}
              set={set}
              columns={cols}
              large={oneHand}
              current={i === doing && k === nextSet}
              onChange={(setIndex, field, value) => onChange(setIndex, field, value, i)}
              onToggle={(setIndex) => onToggle(setIndex, i)}
              onDropChange={(setIndex, k, field, value) =>
                update((s) => setDropField(s, i, setIndex, k, field, value))
              }
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('session.addSet')}
            onPress={() => update((s) => addSet(s, i))}
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
      </>
    );
    if (!inSuperset)
      return (
        <View key={e.rowId} style={{ gap: 16 }}>
          {body}
        </View>
      );
    // In a superset: each exercise in its own frame; the one whose set comes next is selected
    // (2px border in the text colour) and says so in words, never by colour alone.
    return (
      <View
        key={e.rowId}
        accessibilityLabel={current ? t('session.upNowLabel', { name: e.name }) : undefined}
        style={{
          gap: 12,
          padding: 12,
          borderRadius: 20,
          borderWidth: current ? 2 : 1,
          borderColor: current ? colors.borderSelected : colors.borderDecorative,
        }}
      >
        {current ? (
          <Text variant="label" medium>
            {t('session.upNow')}
          </Text>
        ) : null}
        {body}
      </View>
    );
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
                  height: 6,
                  borderRadius: 3,
                  // The exercises on screen (a whole superset) are lit: the page indicator.
                  backgroundColor:
                    i === index || group.includes(i)
                      ? colors.training
                      : exerciseState(e) === 'done'
                        ? colors.success
                        : colors.dotOff,
                }}
              />
            ))}
          </View>
        ) : null}

        {exercise ? (
          <>
            {/* Swipe left / right for the next / previous exercise (a superset moves as one). */}
            <ExerciseSwiper
              page={active.exercises[group[0] ?? index]?.rowId ?? ''}
              order={group[0] ?? index}
              canPrevious={previousEx != null}
              canNext={nextEx != null}
              onPrevious={() => update((s) => goTo(s, previousIndex))}
              onNext={() => update((s) => goTo(s, nextIndex))}
            >
              {inSuperset ? (
                <Text variant="label" muted>
                  {t('session.supersetIntro', { count: group.length })}
                </Text>
              ) : null}
              {group.map((i) => renderExercise(i))}
            </ExerciseSwiper>

            <RestCard />
          </>
        ) : (
          // The big button below already adds the first exercise: no second one here.
          <EmptyState
            icon="plus"
            area="training"
            title={t('session.emptyTitle')}
            body={t('session.emptyBody')}
          />
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
          onPress={() => update((s) => goTo(s, previousIndex))}
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
          <Text variant="bodyL" semibold style={{ color: colors.onAccent }}>
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
          onPress={() => (nextEx ? update((s) => goTo(s, nextIndex)) : openPicker())}
        />
      </View>

      <FinishSheet visible={finishing} onClose={() => setFinishing(false)} />
      <ReorderSheet visible={reordering} onClose={() => setReordering(false)} />
      <SwapSheet
        visible={swapping}
        onClose={() => setSwapping(false)}
        bottomOffset={BOTTOM_NAV_HEIGHT}
      />

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
          label={t('session.swap')}
          variant="secondary"
          icon="swap"
          disabled={!exercise}
          onPress={() => {
            setMenu(false);
            setSwapping(true);
          }}
        />
        <Button
          label={t('session.reorder')}
          variant="secondary"
          icon="grip"
          disabled={active.exercises.length < 2}
          onPress={() => {
            setMenu(false);
            setReordering(true);
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
