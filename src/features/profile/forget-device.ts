import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAiAccessStore } from '@/features/ai/access';
import { useConversations } from '@/features/ai/agent/conversations';
import { useAiSettings } from '@/features/ai/settings-store';
import { relayKeysOf } from '@/features/premium/relay';
import { syncKeysOf } from '@/features/premium/sync';
import { forgetVaultKey } from '@/features/premium/vault-key';
import { planKeyOf } from '@/lib/plan';
import { authStorage } from '@/lib/secure-storage';
import { consentKeyOf } from './consent-server';
import { removeExportFiles } from './export';

/**
 * Everything this device keeps about an account outside its database (DECISIONS 83), forgotten
 * when the account is deleted ("Delete everything"): sync cursors and pending file removals, the
 * relay state and pairing code, the end-to-end encryption key, the plan, what the server was told
 * about the consent, the AI coach access choices and conversations, the export files left in the
 * cache and, unless kept, the AI settings with the user's own API key.
 */
export async function forgetAccountOnDevice(
  userId: string,
  { keepAiSettings = false }: { keepAiSettings?: boolean } = {},
): Promise<void> {
  const relay = relayKeysOf(userId);
  await AsyncStorage.multiRemove([
    ...syncKeysOf(userId),
    ...relay.plain,
    planKeyOf(userId),
    consentKeyOf(userId),
  ]).catch(() => undefined);
  for (const k of relay.secure) await authStorage.removeItem(k).catch(() => undefined);
  await forgetVaultKey(userId).catch(() => undefined);
  useAiAccessStore.setState((s) => {
    const rest = { ...s.byUser };
    delete rest[userId];
    return { byUser: rest };
  });
  useConversations.getState().clearUser(userId);
  // The AI key belongs to the person who entered it on this phone, not to an account.
  if (!keepAiSettings) await useAiSettings.getState().clear();
  removeExportFiles({ olderThanMs: 0 });
}
