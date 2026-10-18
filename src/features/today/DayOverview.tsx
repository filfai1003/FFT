import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type StyleProp, type TextStyle } from 'react-native';
import { Gauge } from '@/components/ui/Gauge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAreaColors, type Area } from '@/components/ui/IconTile';
import { Text } from '@/components/ui/Text';
import { formatInt } from '@/domain/numbers';
import { tick } from '@/lib/haptics';
import { dayPart, daySummary, firstName } from './day-logic';
import { useDayStatus } from './day-status';
import type { WidgetId } from './layout-store';

/** The hour now (local time), read again each time Home comes back into view. */
function useHourNow() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useFocusEffect(useCallback(() => setHour(new Date().getHours()), []));
  return hour;
}

/** "Good evening, Filippo" (local time), the page's title. */
export function Greeting({ name }: { name: string | null | undefined }) {
  const { t } = useTranslation();
  const part = dayPart(useHourNow());
  const first = firstName(name);
  return (
    <Text
      variant="screenTitle"
      accessibilityRole="header"
      numberOfLines={2}
      style={{ fontSize: 24, lineHeight: 28 }}
    >
      {first ? t(`today.greeting.${part}Name`, { name: first }) : t(`today.greeting.${part}`)}
    </Text>
  );
}

/** One line under the header: today's workout and the calories left ("Push A today · 1,650 kcal left"). */
export function DaySummaryLine({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  const status = useDayStatus();
  const line = daySummary(
    (key, params) => t(key as 'today.summaryWorkout', params as { name: string }),
    formatInt,
    { workout: status.workout, eatenKcal: status.eatenKcal, targetKcal: status.targetKcal },
  );
  if (!line) return null;
  return (
    <Text variant="bodyS" muted numeric testID="day-summary" style={style}>
      {line}
    </Text>
  );
}

type Ring = {
  id: WidgetId;
  area: Area;
  icon: IconName;
  label: string;
  value: string;
  share: number;
  a11y: string;
};

/**
 * The day at a glance: small rings for calories, today's workout, water and the streak, each in
 * its area's colour with its name and value under it. Tapping one shows its card.
 */
export function DayRings({ onRing }: { onRing: (id: WidgetId) => void }) {
  const { t } = useTranslation();
  const s = useDayStatus();
  const eaten = Math.round(s.eatenKcal);
  const target = s.targetKcal != null && s.targetKcal > 0 ? Math.round(s.targetKcal) : null;
  const litres = (s.waterMl / 1000).toFixed(1);
  const rings: Ring[] = [
    {
      id: 'nutrition',
      area: 'nutrition',
      icon: 'bowl',
      label: t('today.calories'),
      value: target
        ? t('today.ringPercent', { n: Math.round((eaten / target) * 100) })
        : t('today.ringKcal', { kcal: formatInt(eaten) }),
      share: target ? eaten / target : 0,
      a11y: target
        ? t('today.ringCaloriesA11y', { eaten: formatInt(eaten), target: formatInt(target) })
        : t('today.ringCaloriesNoTargetA11y', { eaten: formatInt(eaten) }),
    },
    {
      id: 'workout',
      area: 'training',
      icon: 'dumbbell',
      label: t('today.ringWorkout'),
      value:
        s.workout.kind === 'done'
          ? t('today.ringWorkoutDone')
          : s.workout.kind === 'next'
            ? t('today.ringWorkoutToDo')
            : t('today.ringWorkoutNoPlan'),
      share: s.workout.kind === 'done' ? 1 : 0,
      a11y:
        s.workout.kind === 'done'
          ? t('today.ringWorkoutDoneA11y')
          : s.workout.kind === 'next'
            ? t('today.ringWorkoutToDoA11y', { name: s.workout.name })
            : t('today.ringWorkoutNoPlanA11y'),
    },
    {
      id: 'water',
      area: 'water',
      icon: 'droplet',
      label: t('today.waterLabel'),
      value: t('today.litres', { l: litres }),
      share: s.waterMl / s.waterGoalMl,
      a11y: t('today.ringWaterA11y', { l: litres, goal: (s.waterGoalMl / 1000).toFixed(1) }),
    },
    {
      id: 'streak',
      area: 'streak',
      icon: 'flame',
      label: t('today.ringStreak'),
      value: t('game.streakWord', { count: s.streak }),
      share: s.streakTarget ? s.streak / s.streakTarget : s.streak > 0 ? 1 : 0,
      a11y: s.streakTarget
        ? t('game.streakA11y', { count: s.streak, target: s.streakTarget })
        : t('game.streakA11yNoTarget', { count: s.streak }),
    },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {rings.map((r) => (
        <RingButton key={r.id} ring={r} onPress={() => onRing(r.id)} />
      ))}
    </View>
  );
}

function RingButton({ ring, onPress }: { ring: Ring; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useAreaColors(ring.area);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ring.a11y}
      accessibilityHint={t('today.ringHint')}
      testID={`day-ring-${ring.id}`}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        borderRadius: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View aria-hidden>
        <Gauge
          value={ring.share}
          size={52}
          stroke={6}
          color={c.fill}
          track={c.soft}
          accessibilityLabel={ring.a11y}
        >
          <Icon name={ring.icon} size={20} color={c.ink} />
        </Gauge>
      </View>
      <View aria-hidden style={{ alignItems: 'center' }}>
        <Text variant="label" semibold numberOfLines={1}>
          {ring.label}
        </Text>
        <Text variant="label" muted numeric numberOfLines={1}>
          {ring.value}
        </Text>
      </View>
    </Pressable>
  );
}
