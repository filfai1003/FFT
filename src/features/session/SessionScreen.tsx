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
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { ExerciseThumb } from '@/features/train/exercise-image';
import { usePlan } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { useNow } from '@/lib/use-now';
import { FinishSheet } from './FinishSheet';
import { RestCard } from './RestCard';
import { SetRow, columnsFor } from './SetRow';
import {
  addSet,
  exerciseState,
  formatClock,
  goTo,
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

const BOTTOM_NAV_HEIGHT = 60 + 34 + 12;

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
  const previousEx = active.exercises[index - 1];
  const nextEx = active.exercises[index + 1];

  const minimize = () => (router.canGoBack() ? goBack(router) : router.replace('/train'));

  const onChange = (setIndex: number, field: SetField, value: string) =>
    update((s) => setField(s, index, setIndex, field, value));

  const onToggle = (setIndex: number) => {
    const before = useSessionStore.getState().active!;
    const setId = before.exercises[index].sets[setIndex].id;
    const { session, completed } = toggleSet(before, index, setIndex, new Date());
    const withRest = completed
      ? startRest(session, before.exercises[index].restS, Date.now())
      : session;
    update(() => withRest);
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
              backgroundColor: colors.accent,
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="bodyS" medium style={{ color: colors.onAccent }}>
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
                {targetReps ? (
                  <Text variant="label" muted>
                    {t('session.targetReps', { reps: targetReps.replace('-', '–') })}
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
          left: 20,
          right: 20,
          bottom: 34,
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <NavButton
          kicker={t('session.previous')}
          name={previousEx?.name}
          icon="chevronLeft"
          disabled={!previousEx}
          onPress={() => update((s) => goTo(s, index - 1))}
        />
        <NavButton
          kicker={nextEx || !exercise ? t('session.next') : t('session.add')}
          name={nextEx?.name ?? (exercise ? t('session.addExercise') : undefined)}
          icon="chevronRight"
          right
          disabled={!exercise}
          onPress={() =>
            nextEx
              ? update((s) => goTo(s, index + 1))
              : router.push({ pathname: '/exercise-picker', params: { target: 'session' } })
          }
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

function NavButton({
  kicker,
  name,
  icon,
  right,
  disabled,
  onPress,
}: {
  kicker: string;
  name?: string;
  icon: 'chevronLeft' | 'chevronRight';
  right?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name ? `${kicker}: ${name}` : kicker}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 60,
        flexDirection: right ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surfaceAlt,
        opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} color={colors.text} />
      <View style={{ flex: 1, gap: 2, alignItems: right ? 'flex-end' : 'flex-start' }}>
        <Text variant="label" muted>
          {kicker}
        </Text>
        <Text variant="bodyS" medium numberOfLines={1}>
          {name ?? ' '}
        </Text>
      </View>
    </Pressable>
  );
}
