import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { addExercises } from '@/features/session/logic';
import { fetchPrevious, newExerciseFromCatalogue } from '@/features/session/start';
import { useSessionStore } from '@/features/session/store';
import { addExercisesToDay, useDayEditorStore } from './day-editor';
import { ExerciseBrowser } from './ExerciseBrowser';
import { useExercises, type Exercise } from './exercises';
import { goBack } from '@/lib/navigation';

/** Pick exercises for a plan day (`target=day`) or for the workout in progress (`target=session`). */
export function ExercisePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const { target } = useLocalSearchParams<{ target?: 'day' | 'session' }>();
  const exercises = useExercises();
  const day = useDayEditorStore((s) => s.state);
  const patchDay = useDayEditorStore((s) => s.patch);
  const active = useSessionStore((s) => s.active);
  const updateSession = useSessionStore((s) => s.update);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const forSession = target === 'session';
  const already = new Set(
    forSession
      ? (active?.exercises.map((e) => e.exerciseId) ?? [])
      : (day?.exercises.map((e) => e.exerciseId) ?? []),
  );
  const title = forSession ? (active?.dayName ?? '') : (day?.name ?? '');

  const toggle = (e: Exercise) => {
    if (already.has(e.id)) return;
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(e.id)) next.delete(e.id);
      else next.add(e.id);
      return next;
    });
  };

  const add = async () => {
    const chosen = (exercises.data ?? []).filter((e) => selected.has(e.id));
    if (chosen.length === 0) return;
    setBusy(true);
    if (forSession) {
      const previous = await fetchPrevious(chosen.map((e) => e.id));
      updateSession((s) =>
        addExercises(
          s,
          chosen.map((e) => newExerciseFromCatalogue(e, previous[e.id] ?? [])),
        ),
      );
    } else {
      patchDay((s) => addExercisesToDay(s, chosen));
    }
    setBusy(false);
    goBack(router);
  };

  return (
    <>
      <Screen gap={14} style={{ paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton
            icon="close"
            accessibilityLabel={t('common.close')}
            onPress={() => goBack(router)}
          />
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="label" muted>
              {t('picker.addTo')}
            </Text>
            <Text variant="displayS" numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>
        <ExerciseBrowser
          mode="select"
          searchLabel={t('picker.search')}
          selected={selected}
          already={already}
          bottomInset={barHeight + 24}
          onToggle={toggle}
        />
      </Screen>
      <BottomActionBar>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('picker.createNew')}
            variant="secondary"
            block={false}
            onPress={() => router.push('/exercise/new')}
          />
          <Button
            size="large"
            label={t('picker.add', { count: selected.size })}
            disabled={selected.size === 0 || busy}
            onPress={add}
            style={{ flex: 1 }}
          />
        </View>
      </BottomActionBar>
    </>
  );
}
