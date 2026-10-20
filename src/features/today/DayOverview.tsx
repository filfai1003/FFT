import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { formatInt } from '@/domain/numbers';
import { dayPart, daySummary, firstName } from './day-logic';
import { useDayStatus } from './day-status';

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
