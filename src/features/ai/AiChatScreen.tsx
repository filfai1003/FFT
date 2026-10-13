import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { useSessionStore } from '@/features/auth/session-store';
import { useToday } from '@/features/profile/use-today';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { newId } from '@/lib/uuid';
import { useChatDraft } from './chat-draft';
import { AiError } from './client';
import { useAiContext } from './context';
import { sortedConversations, useConversations } from './agent/conversations';
import { buildAgentPrompt } from './agent/prompt';
import { canUndo, repairMessages, runAgent, undoCall, type Approval } from './agent/run';
import { ToolCard } from './agent/ToolCard';
import type { AgentMessage, ToolCall, ToolDef, ToolResult } from './agent/types';
import { useAgentTools } from './agent/use-tools';
import { hasAiKey, useAiSettings } from './settings-store';

type Pending = { call: ToolCall; resolve: (a: Approval) => void };

/**
 * Chat with your own AI (your API key). It can look at your data and, with your approval, change
 * it. Conversations are saved on this device; each change can be undone.
 */
export function AiChatScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const params = useLocalSearchParams<{ id?: string; fresh?: string }>();
  const settings = useAiSettings();
  const ctx = useAiContext();
  const tools = useAgentTools();
  const today = useToday();
  const userId = useSessionStore((s) => s.userId);
  const conversations = useConversations((s) => s.conversations);
  const showToast = useToastStore((s) => s.show);

  // The chat opens on the one asked for, else the latest of this account (a new one starts on the first message).
  const [activeId, setActiveId] = useState<string | null>(
    () =>
      (params.fresh ? null : params.id) ??
      sortedConversations(useConversations.getState().conversations).find(
        (c) => c.userId === userId,
      )?.id ??
      null,
  );
  const conversation = activeId ? conversations[activeId] : undefined;
  const messages = conversation?.messages ?? [];

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ message: string; key: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const answer = useRef<((a: Approval) => void) | null>(null);

  useEffect(() => {
    if (!settings.loaded) void settings.load();
    return () => {
      abort.current?.abort();
      answer.current?.('rejected');
    };
  }, [settings]);

  const ready = hasAiKey(settings) && settings.model.trim() !== '';

  const send = async (draft?: string) => {
    const content = (draft ?? text).trim();
    if (!content || sending || !ctx.ready || !userId) return;
    if (draft === undefined) setText('');
    setError(null);

    const store = useConversations.getState();
    const id = activeId ?? store.create(userId);
    if (id !== activeId) setActiveId(id);
    const saved = store.conversations[id]?.messages ?? [];
    const repaired = repairMessages(saved);
    if (repaired.length !== saved.length) store.setMessages(id, repaired);
    const user: AgentMessage = { id: newId(), role: 'user', text: content };
    store.append(id, user);

    setSending(true);
    abort.current = new AbortController();
    try {
      await runAgent({
        settings,
        system: buildAgentPrompt({ today, profile: ctx.profileText }),
        messages: [...repaired, user],
        tools,
        signal: abort.current.signal,
        approve: (call) =>
          new Promise<Approval>((resolve) => {
            const finish = (a: Approval) => {
              answer.current = null;
              setPending(null);
              resolve(a);
            };
            answer.current = finish;
            setPending({ call, resolve: finish });
          }),
        onMessage: (m) => {
          useConversations.getState().append(id, m);
          if (m.role !== 'tool') return;
          const undoable = m.results.find((r) => r.outcome === 'done' && canUndo(r.callId));
          if (undoable)
            showToast({
              message: t('ai.changeDone'),
              bottomOffset: barHeight,
              actionLabel: t('common.undo'),
              onAction: () => void undo(id, undoable.callId),
            });
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError({
        message: e instanceof Error ? e.message : String(e),
        key: e instanceof AiError && e.isKeyProblem,
      });
    } finally {
      setSending(false);
      setPending(null);
    }
  };

  const undo = async (id: string, callId: string) => {
    try {
      if (await undoCall(callId)) {
        useConversations.getState().setOutcome(id, callId, 'undone');
        showToast({ message: t('ai.undone'), bottomOffset: barHeight });
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : t('ai.undoFailed'),
        bottomOffset: barHeight,
      });
    }
  };

  // A message typed in the Today bar is sent as soon as the chat can answer.
  useEffect(() => {
    if (ready && ctx.ready && !sending) {
      const draft = useChatDraft.getState().take();
      if (draft) void Promise.resolve().then(() => send(draft));
    }
  });

  // What every tool call of the conversation ended with.
  const results = new Map<string, ToolResult>();
  for (const m of messages)
    if (m.role === 'tool') for (const r of m.results) results.set(r.callId, r);

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={12}>
        <TopBar
          onBack={() => goBack(router)}
          backLabel={t('common.back')}
          right={
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Button
                label={t('ai.chats')}
                variant="ghost"
                block={false}
                onPress={() => router.push('/ai-chats')}
              />
              <Button
                label={t('ai.newChat')}
                variant="ghost"
                block={false}
                disabled={sending || messages.length === 0}
                onPress={() => setActiveId(null)}
              />
            </View>
          }
        />
        <Text variant="screenTitle">{t('ai.chatScreenTitle')}</Text>

        {!ready ? (
          <Card gap={10}>
            <Text muted>{t('ai.chatNeedsKey')}</Text>
            <Button
              label={t('ai.keyTitle')}
              onPress={() => router.push({ pathname: '/profile/ai', params: { from: '/ai-chat' } })}
            />
            <Button
              label={t('ai.openManual')}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/profile/ai-manual', params: { from: '/ai-chat' } })
              }
            />
          </Card>
        ) : messages.length === 0 ? (
          <Text muted>{t('ai.chatEmpty')}</Text>
        ) : null}

        {messages.map((m) => {
          if (m.role === 'tool') return null;
          if (m.role === 'user')
            return (
              <View key={m.id} style={{ alignItems: 'flex-end' }}>
                <View
                  style={{
                    maxWidth: '92%',
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.borderSelected,
                    backgroundColor: colors.surfaceSelected,
                  }}
                >
                  <Text selectable>{m.text}</Text>
                </View>
              </View>
            );
          return (
            <View key={m.id} style={{ gap: 8, alignItems: 'flex-start' }}>
              {m.text ? (
                <View
                  style={{
                    maxWidth: '92%',
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.borderDecorative,
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Text selectable>{m.text}</Text>
                </View>
              ) : null}
              {m.toolCalls.map((call) => (
                <View key={call.id} style={{ alignSelf: 'stretch' }}>
                  <ToolCard
                    call={call}
                    def={tools.find((d: ToolDef) => d.name === call.name)}
                    result={results.get(call.id)}
                    pending={pending?.call.id === call.id}
                    busy={false}
                    onApprove={() => pending?.resolve('approved')}
                    onReject={() => pending?.resolve('rejected')}
                    onUndo={() => activeId && void undo(activeId, call.id)}
                  />
                </View>
              ))}
            </View>
          );
        })}

        {sending && !pending ? (
          <Text variant="label" muted>
            {t('ai.thinking')}
          </Text>
        ) : null}
        {pending ? (
          <Text variant="label" muted>
            {t('ai.waitingApproval')}
          </Text>
        ) : null}
        {error?.key ? (
          <Card gap={10}>
            <Text variant="body" accessibilityRole="alert">
              {t('ai.keyProblem')}
            </Text>
            <Text variant="bodyS" muted>
              {t('ai.keyProblemBody')}
            </Text>
            <Button
              label={t('ai.openSettings')}
              onPress={() => router.push({ pathname: '/profile/ai', params: { from: '/ai-chat' } })}
            />
            <Button
              label={t('ai.importAnswer')}
              variant="ghost"
              onPress={() =>
                router.push({ pathname: '/profile/ai-manual', params: { from: '/ai-chat' } })
              }
            />
          </Card>
        ) : error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error.message}
          </Text>
        ) : null}
        <Text variant="label" muted>
          {t('ai.privacyShort')}
        </Text>
      </Screen>

      <BottomActionBar>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input
              accessibilityLabel={t('ai.message')}
              placeholder={t('ai.messagePlaceholder')}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void send()}
              editable={ready && !pending}
            />
          </View>
          <Button
            label={t('ai.send')}
            block={false}
            disabled={!ready || sending || !text.trim() || !ctx.ready}
            onPress={() => void send()}
          />
        </View>
      </BottomActionBar>
    </>
  );
}
