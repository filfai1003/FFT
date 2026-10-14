import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { formatClock } from '@/features/session/logic';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { ExerciseThumb } from './exercise-image';
import {
  exerciseFilters,
  exerciseMeta,
  filterExercises,
  groupByMuscle,
  recordLabel,
  type ExerciseFilter,
} from './exercise-filter';
import { useRecords } from './exercise-stats';
import { useExercises, type Exercise } from './exercises';

type Props = {
  /** `browse`: rows open the exercise. `select`: rows are checkboxes. */
  mode: 'browse' | 'select';
  onOpen?: (exercise: Exercise) => void;
  selected?: ReadonlySet<string>;
  onToggle?: (exercise: Exercise) => void;
  /** Exercises already in the day/session: marked "IN DAY". */
  already?: ReadonlySet<string>;
  searchLabel: string;
  /** Space under the last row (a fixed bar over the list, the bottom safe area). */
  bottomInset?: number;
};

/**
 * Search + muscle chips + exercises grouped by muscle. Shared by Library and the picker. Fills the
 * rest of the page: search and chips stay put, only the list scrolls.
 */
export function ExerciseBrowser({
  mode,
  onOpen,
  selected,
  onToggle,
  already,
  searchLabel,
  bottomInset = 24,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const exercises = useExercises();
  const records = useRecords();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter>('all');

  const visible = filterExercises(exercises.data ?? [], { query, filter });
  const groups = groupByMuscle(visible);

  const infoFor = (e: Exercise) => {
    if (mode === 'select') return exerciseMeta(e);
    const label = recordLabel(e, records.data?.get(e.id), unit);
    switch (label.kind) {
      case 'weight':
        return label.est
          ? t('library.recordWeightEst', { max: label.max, est: label.est, unit: label.unit })
          : t('library.recordWeight', { max: label.max, unit: label.unit });
      case 'reps':
        return t('library.bestReps', { count: label.reps });
      case 'time':
        return t('library.bestTime', { time: formatClock(label.seconds) });
      default:
        return t('library.notLogged');
    }
  };

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <Input
        variant="search"
        accessibilityLabel={searchLabel}
        placeholder={searchLabel}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {exerciseFilters.map((f) => (
          <Chip
            key={f}
            role="radio"
            label={t(`library.filter.${f}`)}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingBottom: bottomInset }}
        bottomOffset={bottomInset}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {exercises.isPending ? null : groups.length === 0 ? (
          <Text muted>{t('library.noResults')}</Text>
        ) : (
          groups.map((g) => (
            <Section key={g.muscle} title={t(`library.muscle.${g.muscle}`)}>
              {g.items.map((e) => {
                const isSelected = selected?.has(e.id) ?? false;
                return (
                  <ListRow
                    key={e.id}
                    title={e.name}
                    info={infoFor(e)}
                    badge={
                      e.ownerId != null
                        ? t('library.mine')
                        : mode === 'select' && already?.has(e.id)
                          ? t('library.inDay')
                          : undefined
                    }
                    leading={<ExerciseThumb exercise={e} size={40} />}
                    accessibilityRole={mode === 'select' ? 'checkbox' : 'button'}
                    accessibilityState={mode === 'select' ? { checked: isSelected } : undefined}
                    onPress={() => (mode === 'select' ? onToggle?.(e) : onOpen?.(e))}
                    right={
                      mode === 'select' ? (
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            borderWidth: isSelected ? 0 : 1,
                            borderColor: colors.borderControl,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelected ? <Icon name="check" size={16} color={colors.bg} /> : null}
                        </View>
                      ) : undefined
                    }
                  />
                );
              })}
            </Section>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
