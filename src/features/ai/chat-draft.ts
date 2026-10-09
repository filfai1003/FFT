import { create } from 'zustand';

/** A message typed elsewhere (the Today bar) that the chat sends as soon as it opens. */
export const useChatDraft = create<{
  text: string;
  set: (text: string) => void;
  take: () => string;
}>((set, get) => ({
  text: '',
  set: (text) => set({ text }),
  take: () => {
    const text = get().text;
    if (text) set({ text: '' });
    return text;
  },
}));
