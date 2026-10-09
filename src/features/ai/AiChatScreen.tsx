import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { create } from 'zustand';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { buildChatSystemPrompt, extractJson, parseBundle } from '@/domain/plan-import';
import { useTheme } from '@/design/use-theme';
import { goBack } from '@/lib/navigation';
import { newId } from '@/lib/uuid';
import { useApplyImport, type ApplyResult } from './apply';
import { chatComplete, type ChatMessage } from './client';
import { useAiContext } from './context';
import { ImportPreview } from './ImportPreview';
import { ResultNote } from './ResultNote';
import { hasAiKey, useAiSettings } from './settings-store';

type Message = ChatMessage & { id: string };

/** The conversation lives in memory: leaving the app starts a new one. */
const useChat = create<{ messages: Message[]; add: (m: Message) => void; clear: () => void }>(
  (set) => ({
    messages: [],
    add: (m) => set((s) => ({ messages: [...s.messages, m] })),
    clear: () => set({ messages: [] }),
  }),
);

/** Chat with your own AI (your API key): it can create and modify your plans, you confirm first. */
export function AiChatScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const settings = useAiSettings();
  const ctx = useAiContext();
  const apply = useApplyImport();
  const { messages, add, clear } = useChat();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApplyResult>>({});
  const [applyError, setApplyError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!settings.loaded) void settings.load();
    return () => abort.current?.abort();
  }, [settings]);

  const ready = hasAiKey(settings) && settings.model.trim() !== '';

  const send = async () => {
    const content = text.trim();
    if (!content || sending || !ctx.ready) return;
    setText('');
    setError(null);
    const user: Message = { id: newId(), role: 'user', content };
    add(user);
    setSending(true);
    abort.current = new AbortController();
    try {
      const system = buildChatSystemPrompt({
        profile: ctx.profileText,
        current: ctx.current,
        exercises: ctx.exerciseNames,
      });
      const history = [...messages, user].map(({ role, content: c }) => ({ role, content: c }));
      const reply = await chatComplete(settings, system, history, abort.current.signal);
      add({ id: newId(), role: 'assistant', content: reply });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const applyMessage = async (id: string, content: string) => {
    setApplyError(null);
    try {
      const done = await apply.mutateAsync(parseBundle(content));
      setResults((r) => ({ ...r, [id]: done }));
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={12}>
        <TopBar
          onBack={() => goBack(router)}
          backLabel={t('common.back')}
          right={
            messages.length > 0 ? (
              <Button label={t('ai.newChat')} variant="ghost" block={false} onPress={clear} />
            ) : undefined
          }
        />
        <Text variant="screenTitle">{t('ai.chatScreenTitle')}</Text>

        {!ready ? (
          <Card gap={10}>
            <Text muted>{t('ai.chatNeedsKey')}</Text>
            <Button label={t('ai.keyTitle')} onPress={() => router.push('/profile/ai')} />
            <Button
              label={t('ai.openManual')}
              variant="secondary"
              onPress={() => router.push('/profile/ai-manual')}
            />
          </Card>
        ) : messages.length === 0 ? (
          <Text muted>{t('ai.chatEmpty')}</Text>
        ) : null}

        {messages.map((m) => {
          const bundle =
            m.role === 'assistant' && extractJson(m.content) ? parseBundle(m.content) : null;
          const shown = bundle ? m.content.replace(/```[\s\S]*?```/g, '').trim() : m.content;
          return (
            <View
              key={m.id}
              style={{ gap: 8, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {shown ? (
                <View
                  style={{
                    maxWidth: '92%',
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor:
                      m.role === 'user' ? colors.borderSelected : colors.borderDecorative,
                    backgroundColor: m.role === 'user' ? colors.surfaceSelected : colors.surfaceAlt,
                  }}
                >
                  <Text selectable>{shown}</Text>
                </View>
              ) : null}
              {bundle ? (
                <View style={{ alignSelf: 'stretch' }}>
                  <ImportPreview
                    bundle={bundle}
                    busy={apply.isPending}
                    onApply={() => applyMessage(m.id, m.content)}
                    done={results[m.id] ? <ResultNote result={results[m.id]} /> : undefined}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        {sending ? (
          <Text variant="label" muted>
            {t('ai.thinking')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {applyError ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {applyError}
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
              onSubmitEditing={send}
              editable={ready}
            />
          </View>
          <Button
            label={t('ai.send')}
            block={false}
            disabled={!ready || sending || !text.trim() || !ctx.ready}
            onPress={send}
          />
        </View>
      </BottomActionBar>
    </>
  );
}
