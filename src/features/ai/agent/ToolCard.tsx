import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
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

const short = (v: unknown, max = 40): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** What the call asked, in a few words ("body_metrics · day >= 2026-10-01 · by meal"). */
export function callSummary(call: ToolCall): string {
  const i = call.input;
  if (call.name === 'query_data') {
    const where = Array.isArray(i.where)
      ? (i.where as { column?: string; op?: string; value?: unknown }[]).map((w) =>
          w.op === 'is_null' || w.op === 'not_null'
            ? `${w.column} ${w.op.replace('_', ' ')}`
            : `${w.column} ${w.op} ${short(w.value, 24)}`,
        )
      : [];
    const group =
      Array.isArray(i.group_by) && i.group_by.length ? [`by ${i.group_by.join(', ')}`] : [];
    return [String(i.table ?? ''), ...where, ...group].filter(Boolean).join(' · ');
  }
  return Object.entries(i)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k} ${short(v, 24)}`)
    .join(' · ');
}

/** What came back, in a few words ("12 rows", "3 groups", "8 items"). */
export function resultSummary(result: ToolResult): string {
  try {
    const r = JSON.parse(result.content) as Record<string, unknown> | unknown[];
    if (Array.isArray(r)) return `${r.length} items`;
    if (typeof r.error === 'string') return short(r.error, 60);
    if (typeof r.groups === 'number') return `${r.groups} groups`;
    if (typeof r.matching_rows === 'number') return `${r.matching_rows} rows`;
    if (Array.isArray(r.tables)) return `${r.tables.length} tables`;
    const list = Object.values(r).find(Array.isArray);
    return list ? `${list.length} items` : '';
  } catch {
    return '';
  }
}

/**
 * A look at the data, like a coding agent shows its tool calls: a dot (hollow while it runs,
 * filled when done, "error" when it failed), the tool, what it asked and what came back. Tap to
 * see the exact input and result.
 */
function ToolLine({
  call,
  result,
  title,
}: {
  call: ToolCall;
  result: ToolResult | undefined;
  title: string;
}) {
  const { t: typed } = useTranslation();
  const t = typed as unknown as Translate;
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const failed = result?.outcome === 'error';
  const asked = callSummary(call);
  const got = result ? resultSummary(result) : '';
  const color = failed ? colors.danger : result ? colors.success : colors.textMuted;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[title, asked, failed ? t('ai.outcome.error') : got]
          .filter(Boolean)
          .join(', ')}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: result ? color : 'transparent',
            borderWidth: result ? 0 : 1.5,
            borderColor: color,
          }}
        />
        <Text variant="label" style={{ flexShrink: 1 }} numberOfLines={open ? undefined : 1}>
          <Text variant="label">{title}</Text>
          {asked ? <Text variant="label" muted>{` · ${asked}`}</Text> : null}
          {result ? (
            <Text variant="label" muted={!failed} danger={failed}>
              {` → ${failed ? `${t('ai.outcome.error')}${got ? `: ${got}` : ''}` : got || t('ai.outcome.done')}`}
            </Text>
          ) : (
            <Text variant="label" muted>
              {' …'}
            </Text>
          )}
        </Text>
      </Pressable>
      {open ? (
        <View
          style={{
            marginLeft: 16,
            padding: 10,
            gap: 6,
            borderRadius: 10,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <Text variant="label" muted>
            {JSON.stringify(call.input, null, 1)}
          </Text>
          {result ? (
            <Text variant="label" selectable>
              {result.content.length > 1500 ? `${result.content.slice(0, 1500)}…` : result.content}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
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

  if (!def?.write) return <ToolLine call={call} result={result} title={title} />;

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
