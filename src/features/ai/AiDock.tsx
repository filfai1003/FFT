import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { fontFamily, inputFontSize } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useChatDraft } from './chat-draft';

/** Room the floating bar takes (bar + margins), so screens can leave space under their content. */
export const AI_DOCK_HEIGHT = 72;

/** The AI coach as a floating pill above the tab bar: type, send, the chat opens and answers. */
export function AiDock() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const setDraft = useChatDraft((s) => s.set);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const open = () => {
    setDraft(text.trim());
    setText('');
    router.push('/ai-chat');
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
        backgroundColor: colors.bg,
      }}
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
    </View>
  );
}
