import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient } from '@/lib/supabase';
import type { Plan } from '@/lib/plan';
import { AiError } from './client';
import type { AiSettings } from './settings-store';

/**
 * The AI coach included with Premium: requests go through our server (`ai` function), which pays
 * OpenRouter and takes the cost from the account's monthly AI credit. No key in the app.
 */

export type AiCredit = {
  balanceMicros: number;
  monthlyMicros: number;
  capMicros: number;
  nextGrant: string | null;
};

export const useAiCredit = create<{ credit: AiCredit | null }>(() => ({ credit: null }));

const server = () => getAuthClient() as unknown as SupabaseClient;

/** Euros from micro-euros, with cents ("8.42"). */
export const euros = (micros: number) => (Math.max(micros, 0) / 1_000_000).toFixed(2);

export async function fetchAiCredit(): Promise<AiCredit | null> {
  const { data, error } = await server().rpc('my_ai_credit');
  if (error || !data) return null;
  const d = data as {
    balance_micros: number;
    monthly_micros: number;
    cap_micros: number;
    next_grant: string | null;
  };
  const credit: AiCredit = {
    balanceMicros: Number(d.balance_micros),
    monthlyMicros: Number(d.monthly_micros),
    capMicros: Number(d.cap_micros),
    nextGrant: d.next_grant,
  };
  useAiCredit.setState({ credit });
  return credit;
}

/** The settings the coach really uses: Premium without a key of its own uses the included AI. */
export function effectiveAiSettings(settings: AiSettings, plan: Plan | null): AiSettings {
  if (settings.provider === 'included') return settings;
  if (plan === 'premium' && settings.apiKey.trim() === '')
    return { ...settings, provider: 'included' };
  return settings;
}

/** Ready to chat: the included AI (Premium) or an own key with a model. */
export function aiReady(settings: AiSettings, plan: Plan | null): boolean {
  const s = effectiveAiSettings(settings, plan);
  if (s.provider === 'included') return plan === 'premium';
  return s.apiKey.trim() !== '' && s.model.trim() !== '';
}

/** One OpenAI-style chat request through our server; returns OpenAI-style choices. */
export async function callIncluded(body: { messages: unknown[]; tools?: unknown[] }) {
  const { data, error } = await server().functions.invoke<{
    choices?: unknown[];
    balance_micros?: number;
  }>('ai', { body });
  if (error) {
    // The function's own message ("credit used up", "part of Premium") is in the response.
    const res = (error as { context?: Response }).context;
    let message = error.message;
    let status: number | undefined;
    if (res && typeof res.json === 'function') {
      status = res.status;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) message = j.error;
      } catch {
        // keep the generic message
      }
    }
    throw new AiError(message, status === 401 || status === 403 ? 402 : status);
  }
  const balance = data?.balance_micros;
  if (typeof balance === 'number') {
    const current = useAiCredit.getState().credit;
    if (current) useAiCredit.setState({ credit: { ...current, balanceMicros: balance } });
  }
  return { choices: data?.choices ?? [] };
}
