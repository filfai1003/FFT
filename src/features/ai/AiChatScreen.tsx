import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { Markdown } from '@/components/ui/Markdown';
import { Sheet } from '@/components/ui/Sheet';
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
import { AttachmentChip } from './agent/AttachmentChip';
import { AttachmentError, pickFile, pickPhoto, type Attachment } from './agent/attachments';
import { ToolCard } from './agent/ToolCard';
import type { AgentMessage, ToolCall, ToolDef, ToolResult } from './agent/types';
import { useAgentTools } from './agent/use-tools';
import { aiReady, effectiveAiSettings } from './included';
import { useAiSettings } from './settings-store';
import { usePlanStore } from '@/lib/plan';
import { notSharedCategory, useAiAccess } from './access';
import { AiConsentCard, useAiConsent } from './AiConsent';

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
  const access = useAiAccess();
  const tools = useAgentTools(access);
  // Nothing is sent before the user agrees to the coach (DECISIONS 66).
  const aiConsent = useAiConsent();
  const consented = aiConsent.consent != null;
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

  const plan = usePlanStore((s) => s.plan);
  const ready = aiReady(settings, plan);

  const [files, setFiles] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const attach = async (pick: () => Promise<Attachment | null>) => {
    setAttaching(false);
    try {
      const a = await pick();
      if (a) setFiles((f) => [...f, a]);
    } catch (e) {
      setError({
        message:
          e instanceof AttachmentError && e.message === 'too big'
            ? t('ai.attachTooBig')
            : e instanceof AttachmentError
              ? t('ai.attachUnsupported')
              : e instanceof Error
                ? e.message
                : String(e),
        key: false,
      });
    }
  };

  const send = async (draft?: string) => {
    const content = (draft ?? text).trim();
    const attachments = draft === undefined ? files : [];
    if ((!content && attachments.length === 0) || sending || !ctx.ready || !userId || !consented)
      return;
    if (draft === undefined) {
      setText('');
      setFiles([]);
    }
    setError(null);

    const store = useConversations.getState();
    const id = activeId ?? store.create(userId);
    if (id !== activeId) setActiveId(id);
    const saved = store.conversations[id]?.messages ?? [];
    const repaired = repairMessages(saved);
    if (repaired.length !== saved.length) store.setMessages(id, repaired);
    const user: AgentMessage = {
      id: newId(),
      role: 'user',
      text: content,
      ...(attachments.length ? { attachments } : {}),
    };
    store.append(id, user);

    setSending(true);
    abort.current = new AbortController();
    try {
      await runAgent({
        consented,
        settings: effectiveAiSettings(settings, plan),
        system: buildAgentPrompt({ today, profile: ctx.profileFor(access), access }),
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
    if (ready && consented && ctx.ready && !sending) {
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
        ) : !aiConsent.loaded ? null : !consented ? (
          <AiConsentCard
            onDecline={() => {
              showToast({ message: t('ai.consent.declined') });
              goBack(router);
            }}
          />
        ) : messages.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['day', 'week', 'strength'] as const).map((k) => (
              <Button
                key={k}
                label={t(`ai.suggest.${k}`)}
                variant="secondary"
                block={false}
                disabled={sending}
                onPress={() => void send(t(`ai.suggest.${k}`))}
              />
            ))}
          </View>
        ) : null}

        {messages.map((m) => {
          if (m.role === 'tool') return null;
          if (m.role === 'user')
            return (
              <View key={m.id} style={{ alignItems: 'flex-end' }}>
                <View
                  style={{
                    maxWidth: '92%',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    borderBottomRightRadius: 6,
                    backgroundColor: colors.text,
                  }}
                >
                  {m.attachments?.length ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 6,
                        paddingBottom: m.text ? 6 : 0,
                      }}
                    >
                      {m.attachments.map((a) => (
                        <AttachmentChip key={a.id} attachment={a} inverted />
                      ))}
                    </View>
                  ) : null}
                  {m.text ? (
                    <Text selectable style={{ color: colors.bg }}>
                      {m.text}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          return (
            <View key={m.id} style={{ gap: 8, alignItems: 'flex-start' }}>
              {m.text ? (
                <View
                  style={{
                    maxWidth: '92%',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    borderBottomLeftRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.borderDecorative,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Markdown text={m.text} />
                </View>
              ) : null}
              {m.toolCalls.map((call) => {
                const result = results.get(call.id);
                const hidden = result ? notSharedCategory(result.content) : null;
                return (
                  <View key={call.id} style={{ alignSelf: 'stretch', gap: 8 }}>
                    <ToolCard
                      call={call}
                      def={tools.find((d: ToolDef) => d.name === call.name)}
                      result={result}
                      pending={pending?.call.id === call.id}
                      busy={false}
                      onApprove={() => pending?.resolve('approved')}
                      onReject={() => pending?.resolve('rejected')}
                      onUndo={() => activeId && void undo(activeId, call.id)}
                    />
                    {hidden && !access[hidden] ? (
                      <Card size="small" gap={8}>
                        <Text variant="bodyS">{t(`ai.cannotSee.${hidden}`)}</Text>
                        <Button
                          label={t('ai.allowInSettings')}
                          variant="ghost"
                          onPress={() =>
                            router.push({ pathname: '/profile/ai', params: { from: '/ai-chat' } })
                          }
                        />
                      </Card>
                    ) : null}
                  </View>
                );
              })}
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
          {t('ai.privacyShort')} {t('ai.notMedical')}
        </Text>
      </Screen>

      <BottomActionBar>
        {files.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {files.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => setFiles((f) => f.filter((x) => x.id !== a.id))}
              />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <IconButton
            icon="plus"
            accessibilityLabel={t('ai.attach')}
            disabled={!ready || !consented || sending}
            onPress={() => setAttaching(true)}
          />
          <View style={{ flex: 1 }}>
            <Input
              accessibilityLabel={t('ai.message')}
              placeholder={t('ai.messagePlaceholder')}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void send()}
              editable={ready && consented && !pending}
            />
          </View>
          <Button
            label={t('ai.send')}
            block={false}
            disabled={
              !ready || !consented || sending || (!text.trim() && files.length === 0) || !ctx.ready
            }
            onPress={() => void send()}
          />
        </View>
      </BottomActionBar>

      <Sheet
        visible={attaching}
        onClose={() => setAttaching(false)}
        title={t('ai.attach')}
        closeLabel={t('common.close')}
      >
        <View style={{ gap: 8 }}>
          <Button
            variant="secondary"
            icon="image"
            label={t('ai.attachPhoto')}
            onPress={() => void attach(pickPhoto)}
          />
          <Button
            variant="secondary"
            icon="copy"
            label={t('ai.attachFile')}
            onPress={() => void attach(pickFile)}
          />
        </View>
      </Sheet>
    </>
  );
}
