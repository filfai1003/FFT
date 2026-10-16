import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import type { LogType } from '@/features/train/exercises';
import type { SessionSet, SetField } from './logic';

export type ColumnSpec = {
  field: SetField;
  label: string;
  keyboard: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  placeholder?: string;
};

/** Which inputs a kind of exercise shows: kg × reps, reps, time, km + time. */
export function columnsFor(logType: LogType, weightUnit: string): ColumnSpec[] {
  switch (logType) {
    case 'weight_reps':
      return [
        { field: 'weight', label: weightUnit, keyboard: 'decimal-pad' },
        { field: 'reps', label: 'Reps', keyboard: 'number-pad' },
      ];
    case 'reps':
      return [{ field: 'reps', label: 'Reps', keyboard: 'number-pad' }];
    case 'time':
      return [
        {
          field: 'duration',
          label: 'Time',
          keyboard: 'numbers-and-punctuation',
          placeholder: '0:00',
        },
      ];
    default:
      return [
        { field: 'distance', label: 'km', keyboard: 'decimal-pad' },
        {
          field: 'duration',
          label: 'Time',
          keyboard: 'numbers-and-punctuation',
          placeholder: '0:00',
        },
      ];
  }
}

type Props = {
  index: number;
  set: SessionSet;
  columns: ColumnSpec[];
  /** One-hand mode: taller inputs and a bigger check button. */
  large: boolean;
  onChange: (index: number, field: SetField, value: string) => void;
  onToggle: (index: number) => void;
  /** Typing in drop `k` of this set (drop set). */
  onDropChange?: (index: number, k: number, field: 'weight' | 'reps', value: string) => void;
};

export const SetRow = memo(function SetRow({
  index,
  set,
  columns,
  large,
  onChange,
  onToggle,
  onDropChange,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const n = index + 1;
  const check = large ? 56 : 44;
  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderColor: colors.borderDecorative,
      }}
    >
      <Text variant="displayS" numeric style={{ width: 30 }}>
        {n}
      </Text>
      <Text variant="label" muted style={{ flex: 1 }} numberOfLines={1}>
        {set.previous ?? '—'}
      </Text>
      {columns.map((c) => (
        <View
          key={c.field}
          style={{ width: c.field === 'weight' || c.field === 'distance' ? 70 : 60 }}
        >
          <Input
            variant="compact"
            accessibilityLabel={t('session.setField', { n, field: c.label })}
            value={set[c.field]}
            onChangeText={(v) => onChange(index, c.field, v)}
            keyboardType={c.keyboard}
            placeholder={c.placeholder}
            selectTextOnFocus
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.done }}
        aria-checked={set.done}
        accessibilityLabel={set.done ? t('session.setDone', { n }) : t('session.markDone', { n })}
        onPress={() => onToggle(index)}
        style={{
          width: check,
          height: check,
          borderRadius: check / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: set.done ? 0 : 1,
          borderColor: colors.borderControl,
          backgroundColor: set.done ? colors.text : 'transparent',
        }}
      >
        <Icon name="check" size={22} color={set.done ? colors.bg : colors.textMuted} />
      </Pressable>
    </View>
  );
  if (!set.drops?.length) return row;
  return (
    <View>
      {row}
      {set.drops.map((d, k) => (
        <View
          key={d.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}
        >
          <Text variant="label" muted style={{ width: 30, textAlign: 'right' }}>
            {'↳'}
          </Text>
          <Text variant="label" muted style={{ flex: 1 }} numberOfLines={2}>
            {d.previous
              ? t('session.dropPrevious', { n: k + 1, previous: d.previous })
              : t('session.dropTarget', { n: k + 1, reps: d.target })}
          </Text>
          <View style={{ width: 70 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('session.dropWeight', { n, k: k + 1 })}
              value={d.weight}
              onChangeText={(v) => onDropChange?.(index, k, 'weight', v)}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
          </View>
          <View style={{ width: 60 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('session.dropReps', { n, k: k + 1 })}
              value={d.reps}
              placeholder={d.target}
              onChangeText={(v) => onDropChange?.(index, k, 'reps', v)}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>
          <View style={{ width: check }} />
        </View>
      ))}
    </View>
  );
});
