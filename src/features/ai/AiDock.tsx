import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/design/use-theme';
import { useChatDraft } from './chat-draft';

/** Height of the dock (input row + padding), so screens can leave room for it. */
export const AI_DOCK_HEIGHT = 72;

/** The AI coach pinned above the tab bar: type and send, the chat opens and answers. */
export function AiDock() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const setDraft = useChatDraft((s) => s.set);
  const [text, setText] = useState('');

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
        height: AI_DOCK_HEIGHT,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderTopWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.bg,
      }}
    >
      <View style={{ flex: 1 }}>
        <Input
          accessibilityLabel={t('ai.message')}
          placeholder={t('ai.dockPlaceholder')}
          value={text}
          onChangeText={setText}
          onSubmitEditing={open}
          returnKeyType="send"
        />
      </View>
      <IconButton icon="arrowUp" accessibilityLabel={t('ai.send')} onPress={open} />
    </View>
  );
}
