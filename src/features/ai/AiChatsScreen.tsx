import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile } from '@/components/ui/IconTile';
import { ListRow } from '@/components/ui/ListRow';
import { useTheme } from '@/design/use-theme';
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

/** "Today", "Yesterday", "3 days ago", then the date: when a chat was last used, at a glance. */
export function whenLabel(t: TFunction, iso: string, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return t('common.daysAgo', { count: days });
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The saved conversations with the AI coach: open one, start a new one, delete (with UNDO). */
export function AiChatsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
      {list.length > 0 ? (
        // One card of rows (as the menus): a chat tile, the title, when and how long; delete on the right.
        <Card size="small" gap={0} style={{ paddingVertical: 0 }}>
          {list.map((c, i) => {
            const title = c.title || t('ai.untitledChat');
            const info = `${whenLabel(t, c.updatedAt)} · ${t('ai.messageCount', {
              count: c.messages.filter((m) => m.role === 'user').length,
            })}`;
            return (
              <View
                key={c.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderColor: colors.divider,
                }}
              >
                <View style={{ flex: 1 }}>
                  <ListRow
                    title={title}
                    info={info}
                    divider={false}
                    accessibilityLabel={`${title}, ${info}`}
                    leading={<IconTile icon="chat" area="neutral" size={36} />}
                    onPress={() => router.replace({ pathname: '/ai-chat', params: { id: c.id } })}
                  />
                </View>
                <IconButton
                  look="plain"
                  icon="trash"
                  accessibilityLabel={t('ai.deleteChat')}
                  onPress={() => remove(c.id)}
                />
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
