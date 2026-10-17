import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Screen } from '@/components/ui/Screen';
import { useAiConsent } from '@/features/ai/AiConsent';
import { useChatDraft } from '@/features/ai/chat-draft';
import { aiReady } from '@/features/ai/included';
import { useAiSettings } from '@/features/ai/settings-store';
import { widgetQuestion } from '@/features/widgets/ask';
import { usePlanStore } from '@/lib/plan';

/**
 * fft://ask, from the Coach widget: `prompt` (with the widgets' secret `t`) sends that quick
 * question and opens the chat, where the answer arrives; `focus` opens the chat with the keyboard
 * up. Without the AI coach consent nothing is sent: the chat shows the consent (DECISIONS 66, 68).
 */
export default function Ask() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string; t?: string; focus?: string }>();
  const settings = useAiSettings();
  const plan = usePlanStore((s) => s.plan);
  const consent = useAiConsent();
  const loaded = settings.loaded && consent.loaded;

  useEffect(() => {
    if (!settings.loaded) void settings.load();
  }, [settings]);

  useEffect(() => {
    if (!loaded) return;
    void (async () => {
      const question = await widgetQuestion({
        prompt: params.prompt,
        token: params.t,
        consented: consent.consent != null,
        ready: aiReady(settings, plan),
      });
      // The chat sends a waiting message as soon as it can answer.
      if (question) useChatDraft.getState().set(question);
      router.replace({
        pathname: '/ai-chat',
        params: { fresh: String(Date.now()), ...(params.focus ? { focus: '1' } : {}) },
      });
    })();
    // Once, when the settings and the consent are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return <Screen>{null}</Screen>;
}
