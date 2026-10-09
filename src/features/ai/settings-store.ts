import { create } from 'zustand';
import { authStorage } from '@/lib/secure-storage';

export type AiProvider = 'anthropic' | 'openai';

export type AiSettings = {
  provider: AiProvider;
  /** The user's own API key ("bring your own key"). Stays on this device, encrypted on phones. */
  apiKey: string;
  model: string;
  /** OpenAI-compatible servers only (OpenAI itself, OpenRouter, a local model…). */
  baseUrl: string;
};

export const defaultAiSettings: AiSettings = {
  provider: 'anthropic',
  apiKey: '',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
};

const KEY = 'fft.ai-settings';

type State = AiSettings & {
  loaded: boolean;
  load: () => Promise<void>;
  save: (next: AiSettings) => Promise<void>;
  clear: () => Promise<void>;
};

export const useAiSettings = create<State>((set) => ({
  ...defaultAiSettings,
  loaded: false,
  load: async () => {
    try {
      const raw = await authStorage.getItem(KEY);
      set({
        ...defaultAiSettings,
        ...(raw ? (JSON.parse(raw) as Partial<AiSettings>) : {}),
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (next) => {
    set({ ...next });
    await authStorage.setItem(KEY, JSON.stringify(next));
  },
  clear: async () => {
    set({ ...defaultAiSettings });
    await authStorage.removeItem(KEY);
  },
}));

export const hasAiKey = (s: Pick<AiSettings, 'apiKey'>) => s.apiKey.trim().length > 0;
