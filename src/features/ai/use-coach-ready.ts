import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { usePlanStore } from '@/lib/plan';
import { useAiConsent } from './AiConsent';
import { useChatDraft } from './chat-draft';
import { aiReady } from './included';
import { useAiSettings } from './settings-store';

/**
 * True when the AI coach can answer right now: set up (own key, or included with premium) AND
 * the user agreed to it (DECISIONS 66). Shortcuts to the coach are offered only then.
 */
export function useCoachReady(): boolean {
  const settings = useAiSettings();
  const plan = usePlanStore((s) => s.plan);
  const { consent } = useAiConsent();
  useEffect(() => {
    if (!settings.loaded) void settings.load();
  }, [settings]);
  return settings.loaded && consent != null && aiReady(settings, plan);
}

/** Opens a new chat that sends `question` as soon as it can answer. */
export function useAskCoach() {
  const router = useRouter();
  return (question: string) => {
    useChatDraft.getState().set(question);
    router.push({ pathname: '/ai-chat', params: { fresh: String(Date.now()) } });
  };
}
