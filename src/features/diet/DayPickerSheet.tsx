import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, monthYearLabel } from '@/domain/day';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { monthGrid, shiftMonth } from '@/features/train/HistoryScreen';

/** Month calendar to jump to any past day (the future is disabled). */
export function DayPickerSheet({
  visible,
  onClose,
  selected,
  today,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  today: string;
  onSelect: (day: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [ym, setYm] = useState(selected.slice(0, 7));
  const cells = monthGrid(ym, weekStart);
  const letters =
    weekStart === 'mon' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('diet.pickDay')}
      closeLabel={t('common.close')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('history.prevMonth')}
          onPress={() => setYm(shiftMonth(ym, -1))}
        />
        <Text variant="label">{monthYearLabel(`${ym}-01`)}</Text>
        <IconButton
          icon="chevronRight"
          accessibilityLabel={t('history.nextMonth')}
          disabled={ym >= today.slice(0, 7)}
          onPress={() => setYm(shiftMonth(ym, 1))}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {letters.map((l, i) => (
          <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}>
            <Text variant="label" muted>
              {l}
            </Text>
          </View>
        ))}
        {cells.map((day, i) => {
          const future = day != null && day > today;
          const isSelected = day === selected;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', padding: 2 }}>
              {day ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={String(dayOfMonth(day))}
                  accessibilityState={{ disabled: future, selected: isSelected }}
                  aria-disabled={future}
                  disabled={future}
                  onPress={() => {
                    onSelect(day);
                    onClose();
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isSelected
                      ? colors.borderSelected
                      : day === today
                        ? colors.accent
                        : 'transparent',
                    backgroundColor: isSelected ? colors.surfaceSelected : 'transparent',
                    opacity: future ? 0.3 : 1,
                  }}
                >
                  <Text variant="label">{dayOfMonth(day)}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
