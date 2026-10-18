import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newId } from '@/lib/uuid';
import type { AgentMessage, Conversation, ToolOutcome } from './types';

const MAX_CONVERSATIONS = 40;
const TITLE_CHARS = 48;

type State = {
  conversations: Record<string, Conversation>;
  create: (userId: string) => string;
  /** Removes every conversation of an account (when it is deleted). */
  clearUser: (userId: string) => void;
  append: (id: string, message: AgentMessage) => void;
  /** Replaces the messages (used to close calls left unanswered when the app was closed). */
  setMessages: (id: string, messages: AgentMessage[]) => void;
  setOutcome: (id: string, callId: string, outcome: ToolOutcome) => void;
  remove: (id: string) => void;
};

const titleOf = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > TITLE_CHARS ? `${line.slice(0, TITLE_CHARS - 1)}…` : line;
};

/** Saved AI conversations. They stay on this device, like the rest of the user's data. */
export const useConversations = create<State>()(
  persist(
    (set) => ({
      conversations: {},
      create: (userId) => {
        const id = newId();
        const now = new Date().toISOString();
        set((s) => {
          const all = {
            ...s.conversations,
            [id]: { id, userId, title: '', createdAt: now, updatedAt: now, messages: [] },
          };
          const ids = Object.keys(all);
          if (ids.length > MAX_CONVERSATIONS) {
            const oldest = ids
              .filter((x) => x !== id)
              .sort((a, b) => all[a].updatedAt.localeCompare(all[b].updatedAt))
              .slice(0, ids.length - MAX_CONVERSATIONS);
            for (const old of oldest) delete all[old];
          }
          return { conversations: all };
        });
        return id;
      },
      append: (id, message) =>
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          return {
            conversations: {
              ...s.conversations,
              [id]: {
                ...c,
                title: c.title || (message.role === 'user' ? titleOf(message.text) : ''),
                updatedAt: new Date().toISOString(),
                messages: [...c.messages, message],
              },
            },
          };
        }),
      setMessages: (id, messages) =>
        set((s) => {
          const c = s.conversations[id];
          return c ? { conversations: { ...s.conversations, [id]: { ...c, messages } } } : s;
        }),
      setOutcome: (id, callId, outcome) =>
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          return {
            conversations: {
              ...s.conversations,
              [id]: {
                ...c,
                messages: c.messages.map((m) =>
                  m.role === 'tool'
                    ? {
                        ...m,
                        results: m.results.map((r) =>
                          r.callId === callId ? { ...r, outcome } : r,
                        ),
                      }
                    : m,
                ),
              },
            },
          };
        }),
      clearUser: (userId) =>
        set((s) => ({
          conversations: Object.fromEntries(
            Object.entries(s.conversations).filter(([, c]) => c.userId !== userId),
          ),
        })),
      remove: (id) =>
        set((s) => {
          const all = { ...s.conversations };
          delete all[id];
          return { conversations: all };
        }),
    }),
    {
      name: 'fft.ai-conversations',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Newest first. */
export const sortedConversations = (conversations: Record<string, Conversation>) =>
  Object.values(conversations).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** True once the saved conversations have been read back from the phone's storage. */
export function useConversationsHydrated(): boolean {
  return useSyncExternalStore(
    (notify) => useConversations.persist.onFinishHydration(notify),
    () => useConversations.persist.hasHydrated(),
    () => false,
  );
}
