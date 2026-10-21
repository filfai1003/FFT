import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, weekdayLetter, weekdayName } from '@/domain/day';
import { tick } from '@/lib/haptics';
import { pressFeedback } from './motion';
import { Text } from './Text';

/**
 * What the mark under a day says (DECISIONS 112, 123): on target, off target, logged (today so
 * far, or a day without a target), nothing logged, or nothing to say (a day still to come).
 */
export type DayMark = 'onTarget' | 'off' | 'logged' | 'none' | 'future';

/**
 * The one row of days of the app (DECISIONS 123), the same on Today and Diet: a tap shows that
 * day on the page you are on (never opens something else); the selected day is filled dark; days
 * still to come cannot be picked. Under each day a short mark says how the diet went (shape and
 * words, never colour alone). Holding a day shows what the marks mean. Away from today, a "Back
 * to today" chip under the row brings the page back.
 */
export function DayStrip({
  days,
  selected,
  today,
  onSelect,
  marks,
}: {
  days: readonly string[];
  selected: string;
  today: string;
  onSelect: (day: string) => void;
  /** Leave out for no marks; null while they load (the marks wait rather than show wrong). */
  marks?: Partial<Record<string, DayMark>> | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [legend, setLegend] = useState(false);
  const withMarks = marks !== undefined;

  return (
    <View style={{ gap: 10 }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('days.strip')}
        style={{ flexDirection: 'row', gap: 4 }}
      >
        {days.map((day) => {
          const isSelected = day === selected;
          const isToday = day === today;
          const future = day > today;
          const mark = marks?.[day];
          const spoken = [
            `${weekdayName(day)} ${dayOfMonth(day)}`,
            isToday ? t('days.today') : null,
            future
              ? t('days.future')
              : mark && mark !== 'future'
                ? t(`diet.dayStatus.${mark}`)
                : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <Pressable
              key={day}
              testID={`day-${day}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: future }}
              aria-checked={isSelected}
              aria-disabled={future}
              accessibilityLabel={spoken}
              accessibilityHint={withMarks ? t('days.dayHint') : undefined}
              disabled={future}
              onPress={() => {
                tick();
                onSelect(day);
              }}
              onLongPress={
                withMarks
                  ? () => {
                      tick();
                      setLegend((v) => !v);
                    }
                  : undefined
              }
              style={({ pressed }) => ({
                flex: 1,
                height: withMarks ? 62 : 56,
                borderRadius: 14,
                backgroundColor: isSelected ? colors.text : 'transparent',
                // Today, when another day is shown: a thin ring, so it can always be found.
                borderWidth: isToday && !isSelected ? 1 : 0,
                borderColor: colors.borderControl,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: future ? 0.4 : pressed ? pressFeedback.opacity : 1,
              })}
            >
              <Text variant="label" style={{ color: isSelected ? colors.bg : colors.textMuted }}>
                {weekdayLetter(day)}
              </Text>
              <Text
                variant="body"
                numeric
                semibold
                style={{ fontSize: 16, color: isSelected ? colors.bg : colors.text }}
              >
                {dayOfMonth(day)}
              </Text>
              {withMarks ? (
                <DayMarkBar mark={future ? 'future' : mark} testID={`day-mark-${day}`} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {legend ? <DayMarkLegend /> : null}
      {selected !== today ? (
        <BackToToday
          onPress={() => {
            tick();
            onSelect(today);
          }}
        />
      ) : null}
    </View>
  );
}

/** The short bar under a day: filled green = on target, red outline = off, teal = logged. */
export function DayMarkBar({ mark, testID }: { mark: DayMark | undefined; testID?: string }) {
  const { colors } = useTheme();
  const base = { width: 20, height: 4, borderRadius: 2 } as const;
  const id = testID ? `${testID}-${mark ?? 'none'}` : undefined;
  if (!mark || mark === 'future') return <View aria-hidden testID={id} style={base} />;
  if (mark === 'off')
    return (
      <View
        aria-hidden
        testID={id}
        style={{ ...base, height: 5, borderWidth: 1.5, borderColor: colors.danger }}
      />
    );
  const fill =
    mark === 'onTarget' ? colors.success : mark === 'logged' ? colors.nutrition : colors.dotOff;
  return <View aria-hidden testID={id} style={{ ...base, backgroundColor: fill }} />;
}

/** What the marks under the days mean (a long press on the row, and Today's first tips). */
export function DayMarkLegend() {
  const { t } = useTranslation();
  const items = [
    ['onTarget', t('days.legendOn')],
    ['off', t('days.legendOff')],
    ['logged', t('days.legendLogged')],
    ['none', t('days.legendNone')],
  ] as const;
  return (
    <View
      accessible
      accessibilityLabel={items.map(([, label]) => label).join('. ')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}
    >
      {items.map(([mark, label]) => (
        <View key={mark} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DayMarkBar mark={mark} />
          <Text variant="bodyS" muted>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** "Back to today": a chip under the row of days while another day is shown. */
export function BackToToday({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('days.backToToday')}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? pressFeedback.opacity : 1,
      })}
    >
      <Text variant="body" medium style={{ fontSize: 14 }}>
        {t('days.backToToday')}
      </Text>
    </Pressable>
  );
}
