import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from './keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { FieldChain } from './field-chain';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
  /** Pinned under the content, in thumb reach (e.g. the primary Button). */
  footer?: ReactNode;
};

/** Bottom sheet over a dimmed backdrop. Tap outside, the close button or Android back close it. */
export function Sheet({ visible, onClose, title, closeLabel, children, footer }: SheetProps) {
  const { colors, reduceMotion } = useTheme();
  const { bottom } = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The sheet rises with the keyboard; its content scrolls the focused field into view. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}
      >
        <Pressable accessible={false} aria-hidden onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: colors.borderDecorative,
            paddingTop: 8,
            paddingBottom: Math.max(bottom, space.gapL),
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderControl,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.screenX,
              paddingTop: space.gapM,
            }}
          >
            <Text variant="displayS" accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel={closeLabel} onPress={onClose} />
          </View>
          <FieldChain>
            <KeyboardAwareScrollView
              bottomOffset={space.gapL}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                paddingHorizontal: space.screenX,
                paddingVertical: space.gapL,
                gap: space.gapL,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </KeyboardAwareScrollView>
          </FieldChain>
          {footer ? <View style={{ paddingHorizontal: space.screenX }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
