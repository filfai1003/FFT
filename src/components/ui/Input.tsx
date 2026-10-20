import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { fontFamily, inputFontSize, radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useTranslation } from 'react-i18next';
import { useFieldChain } from './field-chain';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
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
  /**
   * With `secureTextEntry`: an eye button in the field shows what was typed (default on), so a
   * typo is seen before it fails. `false` keeps the field always hidden.
   */
  reveal?: boolean;
};

// react-native-web draws the browser's focus ring on the text field itself, inside our own border.
const webNoOutline = { outlineStyle: 'none', outlineWidth: 0 } as object;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, accessibilityLabel, variant = 'field', display = false, error, reveal = true, ...rest },
  ref,
) {
  const { colors, textScale } = useTheme();
  const { t } = useTranslation();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const revealable = rest.secureTextEntry === true && reveal && variant !== 'compact';
  const chain = useFieldChain();
  const inner = useRef<TextInput | null>(null);
  useEffect(() => chain?.register(inner), [chain]);
  const setRef = (node: TextInput | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  const fontSize = Math.max(inputFontSize, Math.round(inputFontSize * textScale));

  const multiline = rest.multiline === true;
  // Enter goes to the next field, unless the field does something with Enter itself (search, send…).
  const chained = chain != null && !multiline && !rest.onSubmitEditing && variant !== 'search';
  const box = {
    field: {
      ...(multiline
        ? { minHeight: 140, paddingVertical: 12 }
        : { height: touch.secondaryButtonHeight }),
      borderRadius: radius.input,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
    compact: {
      height: touch.minTarget,
      borderRadius: radius.tile,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 8,
    },
    search: {
      height: touch.secondaryButtonHeight,
      borderRadius: radius.input,
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
    ...(multiline
      ? { alignSelf: 'stretch' as const, textAlignVertical: 'top' as const }
      : { height: '100%' as const }),
  };

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="bodyS" semibold muted nativeID={id}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          box,
          {
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            gap: 10,
            borderWidth: 1,
            // Focus = a border in the text colour (the browser's coloured outline is switched off below).
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
          ref={setRef}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityLabelledBy={label ? id : undefined}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={1.5}
          returnKeyType={variant === 'search' ? 'search' : chained ? 'next' : undefined}
          {...rest}
          secureTextEntry={revealable ? !shown : rest.secureTextEntry}
          onSubmitEditing={
            chained && !rest.onSubmitEditing ? () => chain.next(inner) : rest.onSubmitEditing
          }
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
        {revealable ? (
          <IconButton
            look="plain"
            icon={shown ? 'eyeOff' : 'eye'}
            accessibilityLabel={shown ? t('ui.hidePassword') : t('ui.showPassword')}
            onPress={() => setShown((v) => !v)}
            style={{ marginRight: -12 }}
          />
        ) : null}
      </View>
      {error ? (
        <Text variant="bodyS" style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
