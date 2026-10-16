import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useToastStore } from '@/lib/toast-store';
import { MCP_URL } from './api-tokens';

/**
 * AI apps that add FFT by its address and a sign-in with the FFT account (OAuth on the server):
 * no token to copy. Each opens its own page for adding a connector.
 */
export const CONNECTORS = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/settings/connectors' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/#settings/Connectors' },
] as const;

/** Add to Claude / Add to ChatGPT: copies the MCP address and opens the app's connectors page. */
export function ConnectAiButtons({ bottomOffset }: { bottomOffset?: number }) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const connect = async (c: (typeof CONNECTORS)[number]) => {
    await Clipboard.setStringAsync(MCP_URL);
    showToast({
      message: t('api.connectCopied', { app: c.name }),
      durationMs: 8000,
      bottomOffset,
    });
    await Linking.openURL(c.url).catch(() => undefined);
  };
  return CONNECTORS.map((c) => (
    <Button
      key={c.id}
      variant="secondary"
      icon="plus"
      label={t('api.addTo', { app: c.name })}
      onPress={() => void connect(c)}
    />
  ));
}
