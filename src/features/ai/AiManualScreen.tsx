import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { parseBundle } from '@/domain/plan-import';
import { useBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { ActionsPreview } from './agent/ActionsPreview';
import { buildManualPrompt, parseActions } from './agent/manual';
import { buildSnapshot } from './agent/reads';
import { useAgentTools, useReadContext } from './agent/use-tools';
import { useApplyImport, type ApplyResult } from './apply';
import { FULL_ACCESS } from './access';
import { useAiContext } from './context';
import { ImportPreview } from './ImportPreview';
import { ResultNote } from './ResultNote';

/** Manual mode: copy a prompt into any AI chat, paste its JSON answer back and import it. */
export function AiManualScreen() {
  const { t } = useTranslation();
  const goBack = useBack('/profile/ai');
  const barHeight = useTabBarHeight();
  const ctx = useAiContext();
  const read = useReadContext();
  // Manual mode sends nothing: the user copies the text into an AI of their choice themselves.
  const tools = useAgentTools(FULL_ACCESS);
  const apply = useApplyImport();
  const showToast = useToastStore((s) => s.show);
  const [request, setRequest] = useState('');
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bundle = pasted.trim() ? parseBundle(pasted) : null;
  const found = pasted.trim() ? parseActions(pasted, tools) : null;
  const hasActions = (found?.actions.length ?? 0) > 0;
  // An answer with only "actions" is not a plan: do not complain that plans are missing.
  const showBundle =
    bundle != null && (bundle.workout != null || bundle.diet != null || !hasActions);

  const copy = async () => {
    const snapshot = await buildSnapshot(read.ctx, read.userId);
    await Clipboard.setStringAsync(
      buildManualPrompt({
        request,
        profile: ctx.profileText,
        snapshot,
        exercises: ctx.exerciseNames,
        tools,
      }),
    );
    showToast({ message: t('ai.copied'), bottomOffset: barHeight });
  };
  const paste = async () => {
    setPasted(await Clipboard.getStringAsync());
    setResult(null);
    setError(null);
  };
  const run = async () => {
    if (!bundle) return;
    setError(null);
    try {
      setResult(await apply.mutateAsync(bundle));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={goBack} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('ai.manualTitle')}</Text>

      <Card gap={12}>
        <Text variant="label" muted>
          {t('ai.step1')}
        </Text>
        <Input
          label={t('ai.requestLabel')}
          placeholder={t('ai.requestPlaceholder')}
          value={request}
          onChangeText={setRequest}
          multiline
        />
        <Button label={t('ai.copyPrompt')} icon="copy" disabled={!ctx.ready} onPress={copy} />
      </Card>

      <Card gap={12}>
        <Text variant="label" muted>
          {t('ai.step2')}
        </Text>
        <Input
          label={t('ai.pasteLabel')}
          placeholder={t('ai.pastePlaceholder')}
          value={pasted}
          onChangeText={(v) => {
            setPasted(v);
            setResult(null);
            setError(null);
          }}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={t('ai.pasteClipboard')}
            variant="secondary"
            block={false}
            onPress={paste}
          />
          {pasted ? (
            <Button
              label={t('common.clear')}
              variant="ghost"
              block={false}
              onPress={() => {
                setPasted('');
                setResult(null);
              }}
            />
          ) : null}
        </View>
      </Card>

      {hasActions && found ? <ActionsPreview key={pasted} actions={found.actions} /> : null}
      {found?.errors.map((e) => (
        <Text key={e} variant="bodyS" danger accessibilityRole="alert">
          {e}
        </Text>
      ))}
      {showBundle && bundle ? (
        <ImportPreview
          bundle={bundle}
          busy={apply.isPending}
          onApply={run}
          done={result ? <ResultNote result={result} from="/profile/ai-manual" /> : undefined}
        />
      ) : null}
      {error ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
