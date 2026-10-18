import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useSessionStore } from '@/features/auth/session-store';
import { useBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import {
  sortedConversations,
  useConversations,
  useConversationsHydrated,
} from './agent/conversations';

/** The saved conversations with the AI coach: open one, start a new one, delete (with UNDO). */
export function AiChatsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = useBack('/ai-chat');
  const userId = useSessionStore((s) => s.userId);
  const conversations = useConversations((s) => s.conversations);
  const showToast = useToastStore((s) => s.show);
  const hydrated = useConversationsHydrated();
  const list = sortedConversations(conversations).filter((c) => c.userId === userId);

  const remove = (id: string) => {
    const removed = conversations[id];
    useConversations.getState().remove(id);
    showToast({
      message: t('ai.chatDeleted'),
      actionLabel: t('common.undo'),
      onAction: () =>
        useConversations.setState((s) => ({
          conversations: { ...s.conversations, [id]: removed },
        })),
    });
  };

  return (
    <Screen scroll bottomBarHeight={24} gap={12}>
      <TopBar onBack={goBack} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('ai.chats')}</Text>
      <Button
        label={t('ai.newChat')}
        onPress={() => router.replace({ pathname: '/ai-chat', params: { fresh: '1' } })}
      />
      {!hydrated ? (
        <SkeletonGroup accessibilityLabel={t('common.loading')} gap={12}>
          <SkeletonCard tile={false} lines={0} />
          <SkeletonCard tile={false} lines={0} />
          <SkeletonCard tile={false} lines={0} />
        </SkeletonGroup>
      ) : list.length === 0 ? (
        <EmptyState icon="chat" title={t('ai.noChats')} body={t('empty.chatsBody')} />
      ) : null}
      {list.map((c) => (
        <Card key={c.id} size="small">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.title || t('ai.untitledChat')}
              onPress={() => router.replace({ pathname: '/ai-chat', params: { id: c.id } })}
              style={{ flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' }}
            >
              <Text numberOfLines={1}>{c.title || t('ai.untitledChat')}</Text>
              <Text variant="bodyS" muted>
                {new Date(c.updatedAt).toLocaleDateString()} ·{' '}
                {t('ai.messageCount', {
                  count: c.messages.filter((m) => m.role === 'user').length,
                })}
              </Text>
            </Pressable>
            <IconButton
              icon="trash"
              accessibilityLabel={t('ai.deleteChat')}
              onPress={() => remove(c.id)}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
