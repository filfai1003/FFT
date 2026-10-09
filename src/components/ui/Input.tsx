import { forwardRef, useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { fontFamily, inputFontSize, radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { Icon } from './Icon';
import { Text } from './Text';

export type InputProps = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  /** Visible label above the field; also the accessible name. */
  label?: string;
  /** Needed when there is no visible label. */
  accessibilityLabel?: string;
  /**
   * field = 52px titled field (Doto 24 when `display`), compact = 44px centred value,
   * search = 52px pill with a magnifier.
   */
  variant?: 'field' | 'compact' | 'search';
  /** Doto 24 text for names/titles (field variant). */
  display?: boolean;
  error?: string;
};

// react-native-web draws the browser's focus ring on the text field itself, inside our own border.
const webNoOutline = { outlineStyle: 'none', outlineWidth: 0 } as object;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, accessibilityLabel, variant = 'field', display = false, error, ...rest },
  ref,
) {
  const { colors, textScale } = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const fontSize = Math.max(inputFontSize, Math.round(inputFontSize * textScale));

  const box = {
    field: {
      height: touch.primaryButtonHeight - 4,
      borderRadius: radius.row,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
    compact: {
      height: touch.minTarget,
      borderRadius: radius.tile,
      backgroundColor: colors.bg,
      paddingHorizontal: 8,
    },
    search: {
      height: touch.primaryButtonHeight - 4,
      borderRadius: 26,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
  }[variant];

  const textStyle = {
    color: colors.text,
    fontSize: display && variant === 'field' ? Math.round(24 * textScale) : fontSize,
    fontFamily:
      variant === 'compact' ? fontFamily.label : display ? fontFamily.display : fontFamily.body,
    textAlign: variant === 'compact' ? ('center' as const) : ('left' as const),
    flex: 1,
    minWidth: 0,
    padding: 0,
    height: '100%' as const,
  };

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" muted nativeID={id}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          box,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            // Focus = a white border (the browser's coloured outline is switched off below).
            borderColor: error
              ? colors.danger
              : focused
                ? colors.borderSelected
                : colors.borderControl,
          },
        ]}
      >
        {variant === 'search' ? <Icon name="search" color={colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityLabelledBy={label ? id : undefined}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={1.5}
          returnKeyType={variant === 'search' ? 'search' : undefined}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[textStyle, webNoOutline]}
        />
      </View>
      {error ? (
        <Text variant="bodyS" style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
