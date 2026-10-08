import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { parseDecimal, stepValue } from '@/domain/numbers';
import { fontFamily, inputFontSize, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon } from './Icon';
import { Text } from './Text';

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shows the value, e.g. seconds as 2:00. Used by the `inline` variant. */
  format?: (value: number) => string;
  decreaseLabel: string;
  increaseLabel: string;
  /** Accessible name of the typed value (amount variant). */
  valueLabel?: string;
  /**
   * inline = 44px bar, − value + (sets, rest). amount = round 48px buttons around an
   * editable number with a unit (grams).
   */
  variant?: 'inline' | 'amount';
  unit?: string;
};

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  format = String,
  decreaseLabel,
  increaseLabel,
  valueLabel,
  variant = 'inline',
  unit,
}: StepperProps) {
  const { colors, textScale } = useTheme();
  const [draft, setDraft] = useState(String(value));
  // Re-sync the typed text when the value changes from outside (buttons, reset).
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setDraft(String(value));
  }

  const change = (delta: number) => {
    tick();
    onChange(stepValue(value, delta, min, max));
  };

  const commit = () => {
    const n = parseDecimal(draft);
    if (n == null) return setDraft(String(value));
    const next = Math.min(Math.max(n, min), max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const button = (kind: 'dec' | 'inc', size: number) => {
    const disabled = kind === 'dec' ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={kind === 'dec' ? decreaseLabel : increaseLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => change(kind === 'dec' ? -step : step)}
        style={({ pressed }) => [
          {
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          },
          variant === 'amount' && {
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: colors.borderControl,
          },
        ]}
      >
        <Icon name={kind === 'dec' ? 'minus' : 'plus'} color={colors.text} size={18} />
      </Pressable>
    );
  };

  if (variant === 'amount') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {button('dec', 48)}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 48,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.borderControl,
            backgroundColor: colors.bg,
          }}
        >
          <TextInput
            accessibilityLabel={valueLabel}
            value={draft}
            onChangeText={setDraft}
            onEndEditing={commit}
            onBlur={commit}
            keyboardType="decimal-pad"
            selectTextOnFocus
            maxFontSizeMultiplier={1.5}
            selectionColor={colors.accent}
            style={{
              minWidth: 60,
              height: 46,
              padding: 0,
              textAlign: 'right',
              color: colors.text,
              fontFamily: fontFamily.label,
              fontSize: Math.max(inputFontSize, Math.round(18 * textScale)),
            }}
          />
          {unit ? (
            <Text variant="body" muted>
              {unit}
            </Text>
          ) : null}
        </View>
        {button('inc', 48)}
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: touch.minTarget,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.bg,
      }}
    >
      {button('dec', touch.minTarget)}
      <Text variant="body" style={{ fontFamily: fontFamily.label }} accessibilityRole="adjustable">
        {format(value)}
      </Text>
      {button('inc', touch.minTarget)}
    </View>
  );
}
