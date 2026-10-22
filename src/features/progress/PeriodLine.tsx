import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { Area } from '@/components/ui/IconTile';
import { Sparkline } from '@/components/ui/Sparkline';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { EmptyLine } from './EmptyLine';

/** A line takes the colour of its change: green better, red worse, black otherwise. */
export function useLineColors() {
  const { colors } = useTheme();
  return {
    lineColor: (a: Area) =>
      a === 'better' ? colors.success : a === 'worse' ? colors.danger : colors.text,
    lineFill: (a: Area) =>
      a === 'better' ? colors.successSoft : a === 'worse' ? colors.dangerSoft : colors.surfaceAlt,
  };
}

/** A change said in words for screen readers ("down 1.8 kg"): the arrow of a chip is not read. */
export function useChangeWords() {
  const { t } = useTranslation();
  return (delta: number, text: string) =>
    delta < 0
      ? t('progress.downBy', { value: text })
      : delta > 0
        ? t('progress.upBy', { value: text })
        : t('progress.steady');
}

/** "8 Sep": a date under a line (the weekday would crowd it). */
const dayMonth = (day: string) => shortDateLabel(day).split(' ').slice(1).join(' ');

/**
 * A period's line with its dates (Body page, Home weight card), or where it will start: one value
 * or none yet (DECISIONS 114). The line and its soft fill take the colour of the change.
 */
export function PeriodLine({
  values,
  from,
  to,
  area,
  height,
  label,
  hasValue,
  middle,
  emptyNote,
}: {
  values: readonly number[];
  /** First day of the period. */
  from: string;
  /** Last day of the period: "Today" when left out (a past day on Home passes its date). */
  to?: string;
  area: Area;
  height: number;
  label: string;
  hasValue: boolean;
  /** Something between the two dates (the goal on Home). */
  middle?: ReactNode;
  /** The words under a line still to come; null for none. Default: the check-in to make. */
  emptyNote?: ReactNode;
}) {
  const { t } = useTranslation();
  const { lineColor, lineFill } = useLineColors();
  if (values.length < 2) {
    const note =
      emptyNote !== undefined ? (
        emptyNote
      ) : (
        <Text variant="label" muted>
          {hasValue ? t('progress.lineNext') : t('progress.addAtCheckIn')}
        </Text>
      );
    return (
      <View style={{ gap: 6 }}>
        <EmptyLine height={height} start={hasValue} />
        {note}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Sparkline
        values={values}
        height={height}
        color={lineColor(area)}
        fill={lineFill(area)}
        accessibilityLabel={label}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text variant="label" muted numeric>
          {dayMonth(from)}
        </Text>
        {middle}
        <Text variant="label" muted numeric>
          {to ? dayMonth(to) : t('common.today')}
        </Text>
      </View>
    </View>
  );
}
