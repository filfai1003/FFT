import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { Translate } from '@/i18n';
import { newId } from '@/lib/uuid';
import type { ParsedAction } from './manual';
import { canUndo, runTool, undoCall } from './run';
import type { ToolCall, ToolResult } from './types';

/**
 * Manual mode: the changes found in an AI's answer, shown before anything happens. One button
 * applies them all (each with the same checks as in the chat); they can be undone together.
 */
export function ActionsPreview({ actions }: { actions: ParsedAction[] }) {
  const { t: typed } = useTranslation();
  const t = typed as unknown as Translate;
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ToolResult[] | null>(null);
  const [undone, setUndone] = useState(false);

  // One id per action, made once: it ties the result (and its UNDO) to the action.
  const [ids] = useState(() => actions.map(() => newId()));

  const apply = async () => {
    setBusy(true);
    const done: ToolResult[] = [];
    for (let i = 0; i < actions.length; i++) {
      const call: ToolCall = { id: ids[i], name: actions[i].tool.name, input: actions[i].input };
      done.push(
        await runTool(call, [actions[i].tool], async () => 'approved').catch<ToolResult>(() => ({
          callId: call.id,
          outcome: 'error',
          content: '{"error":"failed"}',
        })),
      );
    }
    setResults(done);
    setBusy(false);
  };

  const undoAll = async () => {
    for (const r of [...(results ?? [])].reverse()) if (canUndo(r.callId)) await undoCall(r.callId);
    setUndone(true);
  };

  const failed = (results ?? []).filter((r) => r.outcome === 'error').length;
  const made = (results ?? []).filter((r) => r.outcome === 'done').length;

  return (
    <Card gap={10}>
      <Text variant="label" muted>
        {t('ai.actionsTitle')}
      </Text>
      {actions.map((a, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Text variant="body">{t(`ai.tool.${a.tool.name}`)}</Text>
          <ActionLines id={ids[i]} action={a} failed={results?.[i]?.outcome === 'error'} t={t} />
        </View>
      ))}
      {results ? (
        <View style={{ gap: 8 }}>
          <Text variant="body">
            {undone ? t('ai.undone') : t('ai.actionsDone', { count: made })}
          </Text>
          {failed > 0 ? (
            <Text variant="bodyS" danger>
              {t('ai.actionsFailed', { count: failed })}
            </Text>
          ) : null}
          {!undone && results.some((r) => canUndo(r.callId)) ? (
            <Button label={t('common.undo')} variant="secondary" onPress={undoAll} />
          ) : null}
        </View>
      ) : (
        <Button
          label={busy ? t('ai.importing') : t('ai.applyActions')}
          disabled={busy}
          onPress={apply}
        />
      )}
    </Card>
  );
}

function ActionLines({
  id,
  action,
  failed,
  t,
}: {
  id: string;
  action: ParsedAction;
  failed: boolean;
  t: Translate;
}) {
  const lines = useQuery({
    queryKey: ['ai-change', id],
    staleTime: Infinity,
    queryFn: async () => (await action.tool.describe?.(action.input)) ?? [],
  });
  return (lines.data ?? []).map((l, j) => (
    <Text key={j} variant="label" muted>
      {t(`ai.field.${l.label}`)} · {l.value}
      {failed ? ' ✕' : ''}
    </Text>
  ));
}
