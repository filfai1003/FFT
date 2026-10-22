import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { ListRow } from '@/components/ui/ListRow';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { swapCandidates, type TrainingLocation } from '@/domain/swap';
import { useProfile } from '@/features/profile/api';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { ExerciseThumb } from '@/features/train/exercise-image';
import { useExercises, type Exercise } from '@/features/train/exercises';
import { useToastStore } from '@/lib/toast-store';
import { swapExercise } from './logic';
import { fetchPrevious, newExerciseFromCatalogue } from './start';
import { useSessionStore } from './store';

const SHOWN = 12;
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * Swap the exercise on screen for another (machine taken…), for this workout only: alternatives
 * for the same muscle first, or any exercise by name. UNDO puts it back.
 */
export function SwapSheet({
  visible,
  onClose,
  bottomOffset,
}: {
  visible: boolean;
  onClose: () => void;
  bottomOffset: number;
}) {
  const { t } = useTranslation();
  const active = useSessionStore((s) => s.active);
  const update = useSessionStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);
  const smallPlates = usePreferencesStore((s) => s.smallPlates);
  const profile = useProfile();
  const all = useExercises().data ?? [];
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const current = active?.exercises[active.index];
  const currentExercise = all.find((e) => e.id === current?.exerciseId);
  const inWorkout = active?.exercises.map((e) => e.exerciseId) ?? [];
  const location = (profile.data?.training_location ?? null) as TrainingLocation;
  const q = query.trim().toLowerCase();
  const list = q
    ? all
        .filter((e) => !inWorkout.includes(e.id) && e.name.toLowerCase().includes(q))
        .slice(0, SHOWN)
        .map((exercise) => ({ exercise, similar: false, otherEquipment: false }))
    : currentExercise
      ? swapCandidates(currentExercise, all, inWorkout, location).slice(0, SHOWN)
      : [];

  const choose = async (chosen: Exercise) => {
    const before = useSessionStore.getState().active;
    if (!before || busy) return;
    setBusy(true);
    // Its own history: the PREVIOUS column and the suggested weight of the new exercise.
    const previous = await fetchPrevious([chosen.id]);
    setBusy(false);
    const from = before.exercises[before.index]?.name ?? '';
    const snapshot = { exercises: before.exercises, index: before.index };
    update((s) =>
      swapExercise(
        s,
        s.index,
        newExerciseFromCatalogue(chosen, previous[chosen.id] ?? []),
        smallPlates,
      ),
    );
    setQuery('');
    onClose();
    showToast({
      message: t('session.swapped', { from, to: chosen.name }),
      actionLabel: t('common.undo'),
      bottomOffset,
      onAction: () => update((s) => ({ ...s, ...snapshot })),
    });
  };

  const done = current?.sets.filter((x) => x.done).length ?? 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('session.swapTitle', { name: current?.name ?? '' })}
      closeLabel={t('common.close')}
    >
      <Text variant="bodyS" muted>
        {done > 0 ? t('session.swapPartly', { count: done }) : t('session.swapIntro')}
      </Text>
      <Input
        accessibilityLabel={t('session.swapSearch')}
        placeholder={t('session.swapSearch')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {!q && currentExercise ? (
        <Text variant="label" muted>
          {t('session.swapSameMuscle', {
            muscle: t(`library.muscle.${currentExercise.primaryMuscle}`),
          })}
        </Text>
      ) : null}
      <View>
        {list.map(({ exercise, similar, otherEquipment }) => (
          <ListRow
            key={exercise.id}
            title={exercise.name}
            info={[
              t(`library.muscle.${exercise.primaryMuscle}`),
              cap(exercise.equipment),
              otherEquipment
                ? t('session.swapOtherEquipment')
                : similar
                  ? t('session.swapSimilar')
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            leading={<ExerciseThumb exercise={exercise} size={40} />}
            onPress={() => void choose(exercise)}
            accessibilityLabel={t('session.swapTo', { name: exercise.name })}
          />
        ))}
        {list.length === 0 ? (
          <Text variant="bodyS" muted>
            {t('session.swapNone')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
