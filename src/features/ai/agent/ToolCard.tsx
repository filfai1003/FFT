import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { Translate } from '@/i18n';
import { canUndo } from './run';
import type { ToolCall, ToolDef, ToolResult } from './types';

type Props = {
  call: ToolCall;
  def: ToolDef | undefined;
  result: ToolResult | undefined;
  /** This call is waiting for the user's answer. */
  pending: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
};

function errorText(result: ToolResult): string {
  try {
    const parsed = JSON.parse(result.content) as { error?: string };
    return parsed.error ?? '';
  } catch {
    return '';
  }
}

/**
 * A tool the assistant used. Looking at data is one quiet line; a change shows what it will do,
 * waits for Approve / Not now, and afterwards says what happened (with UNDO while it can).
 */
export function ToolCard({ call, def, result, pending, busy, onApprove, onReject, onUndo }: Props) {
  const { t: typed } = useTranslation();
  const t = typed as unknown as Translate;
  const title = t(`ai.tool.${call.name}`);

  const lines = useQuery({
    queryKey: ['ai-change', call.id],
    enabled: !!def?.write,
    staleTime: Infinity,
    queryFn: async () => def?.describe?.(call.input) ?? [],
  });

  if (!def?.write) {
    return (
      <Text variant="label" muted>
        {result?.outcome === 'error'
          ? `${title} · ${t('ai.outcome.error')}`
          : result
            ? title
            : `${title}…`}
      </Text>
    );
  }

  return (
    <Card size="small" gap={10}>
      <Text variant="label" muted>
        {title}
      </Text>
      {(lines.data ?? []).map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Text variant="bodyS" muted style={{ width: 92 }}>
            {t(`ai.field.${l.label}`)}
          </Text>
          <Text variant="bodyS" style={{ flex: 1 }} selectable>
            {l.value}
          </Text>
        </View>
      ))}
      {pending ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={t('ai.approve')} disabled={busy} onPress={onApprove} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('ai.reject')} variant="secondary" onPress={onReject} />
          </View>
        </View>
      ) : result ? (
        <View style={{ gap: 8 }}>
          <Text
            variant="label"
            muted={result.outcome === 'done'}
            danger={result.outcome === 'error'}
          >
            {t(`ai.outcome.${result.outcome}`)}
          </Text>
          {result.outcome === 'error' ? (
            <Text variant="bodyS" muted>
              {errorText(result)}
            </Text>
          ) : null}
          {result.outcome === 'done' && canUndo(call.id) ? (
            <Button label={t('common.undo')} variant="secondary" onPress={onUndo} />
          ) : null}
        </View>
      ) : (
        <Text variant="label" muted>
          {t('ai.outcome.cancelled')}
        </Text>
      )}
    </Card>
  );
}
