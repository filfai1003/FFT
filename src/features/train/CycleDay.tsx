import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { DotBar } from '@/components/ui/DotBar';
import { Icon } from '@/components/ui/Icon';
import { pressFeedback } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import type { CycleDay, CycleDayState } from './cycle';

/**
 * The round mark of a plan day: done = green with a check, up next = filled in the text colour
 * with its number, to do = its number on the soft surface. Shape and fill differ, not only hue.
 */
export function DayBadge({
  n,
  state,
  size = 32,
}: {
  n: number;
  state: CycleDayState;
  size?: number;
}) {
  const { colors } = useTheme();
  const bg = state === 'done' ? colors.success : state === 'next' ? colors.text : colors.surfaceAlt;
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {state === 'done' ? (
        <Icon name="check" size={Math.round(size / 2)} color={colors.bg} />
      ) : (
        <Text
          variant="bodyS"
          semibold
          numeric
          style={{ color: state === 'next' ? colors.bg : colors.text }}
        >
          {n}
        </Text>
      )}
    </View>
  );
}

/** "Up next", "Done Thu", "To do": the state of a day in words (colour is never alone). */
export function useDayStateLabel() {
  const { t } = useTranslation();
  return (d: CycleDay) =>
    d.state === 'next'
      ? t('train.dayState.next')
      : d.state === 'done'
        ? d.weekday
          ? t('train.dayState.doneOn', { weekday: d.weekday })
          : t('train.dayState.done')
        : t('train.dayState.todo');
}

/** One day in the cycle grid of Train: its badge, name and state; opens the plan. */
export function DayTile({ day, onPress }: { day: CycleDay; onPress: () => void }) {
  const { colors } = useTheme();
  const stateLabel = useDayStateLabel()(day);
  const next = day.state === 'next';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day.name}, ${stateLabel}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: next ? 11 : 12,
        paddingVertical: 10,
        borderRadius: radius.cardSmall,
        borderWidth: next ? 2 : 1,
        borderColor: next ? colors.borderSelected : colors.borderDecorative,
        backgroundColor:
          day.state === 'done' ? colors.successSoft : next ? colors.surface : colors.bg,
        opacity: pressed ? pressFeedback.opacity : 1,
      })}
    >
      <DayBadge n={day.n} state={day.state} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" semibold numberOfLines={1}>
          {day.name}
        </Text>
        <Text
          variant="label"
          semibold
          numberOfLines={1}
          style={{ color: next ? colors.trainingInk : colors.textMuted }}
        >
          {stateLabel}
        </Text>
      </View>
    </Pressable>
  );
}

/** The cycle as one segment per day, filled in training purple for the days done. */
export function CycleBar({ cycle, done, total }: { cycle: number; done: number; total: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <DotBar
      shape="segment"
      total={Math.max(total, 1)}
      on={done}
      size={8}
      gap={4}
      color={colors.training}
      track={colors.trainingSoft}
      accessibilityLabel={t('train.cycleLabel', { n: cycle, done, total })}
    />
  );
}

/** Small neutral pills with exercise names ("Bench press", "+3 more"). */
export function ExerciseChips({ names, more }: { names: string[]; more: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const items = more > 0 ? [...names, t('train.moreExercises', { count: more })] : names;
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((label, i) => (
        <View
          key={`${i}-${label}`}
          style={{
            minHeight: 28,
            paddingHorizontal: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceAlt,
            justifyContent: 'center',
          }}
        >
          <Text variant="label" semibold numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
