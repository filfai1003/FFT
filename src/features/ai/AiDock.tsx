import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardStickyView } from '@/components/ui/keyboard';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { fontFamily, inputFontSize } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useChatDraft } from './chat-draft';

/** Room the floating bar takes (bar + margins), so screens can leave space under their content. */
export const AI_DOCK_HEIGHT = 72;
/** Space a page leaves under its last card when the bar is shown: the bar, its shadow and air. */
export const AI_DOCK_CLEARANCE = AI_DOCK_HEIGHT + 28;
const SLIDE_MS = 200;

/**
 * The AI coach as a floating pill above the tab bar: type, send, the chat opens and answers.
 * `hidden` slides it down out of the way (Home hides it while scrolling down, shows it again on
 * the way up); never while it is being typed in. Reduce motion: it just disappears and comes back.
 */
export function AiDock({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const router = useRouter();
  const setDraft = useChatDraft((s) => s.set);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const tabBar = useTabBarHeight();
  const away = hidden && !focused && text === '';
  const offset = useSharedValue(0);
  useEffect(() => {
    const to = away ? AI_DOCK_HEIGHT + 16 : 0;
    offset.set(reduceMotion ? to : withTiming(to, { duration: SLIDE_MS }));
  }, [away, reduceMotion, offset]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  const open = () => {
    setDraft(text.trim());
    setText('');
    router.push('/ai-chat');
  };

  return (
    // Rides on top of the keyboard while typing (the tab bar it normally sits on stays under it).
    <KeyboardStickyView
      offset={{ closed: 0, opened: tabBar }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      pointerEvents="box-none"
    >
      <Animated.View
        testID="ai-dock"
        style={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }, slide]}
        pointerEvents={away ? 'none' : 'box-none'}
        aria-hidden={away}
      >
        <View
          style={{
            height: 54,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 18,
            paddingRight: 5,
            borderRadius: 27,
            borderWidth: 1,
            borderColor: focused ? colors.borderSelected : colors.borderControl,
            backgroundColor: colors.surface,
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Icon name="chat" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel={t('ai.message')}
            placeholder={t('ai.dockPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={open}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="send"
            style={[
              {
                flex: 1,
                color: colors.text,
                fontFamily: fontFamily.body,
                fontSize: inputFontSize,
                paddingVertical: 0,
              },
              // react-native-web draws the browser's focus ring on the field itself.
              { outlineStyle: 'none', outlineWidth: 0 } as object,
            ]}
          />
          <IconButton icon="arrowUp" accessibilityLabel={t('ai.send')} onPress={open} />
        </View>
      </Animated.View>
    </KeyboardStickyView>
  );
}
