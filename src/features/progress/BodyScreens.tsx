import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DotBar } from '@/components/ui/DotBar';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { dotsOn } from '@/domain/dots';
import { relativeDay, shortDateLabel, weekdayName, dayOfMonth } from '@/domain/day';
import { parseDecimal } from '@/domain/numbers';
import { goalProgress } from '@/domain/progress';
import { cmToFeetInches, displayWeight, storedWeight } from '@/domain/units';
import { usePrivacyStore } from '@/features/profile/privacy-store';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useToastStore } from '@/lib/toast-store';
import { goBack } from '@/lib/navigation';
import {
  measureKeys,
  useBodyEntries,
  useBodyGoal,
  useDeleteEntry,
  useSaveCheckIn,
  useSetBodyGoal,
  type BfMethod,
} from './data';
import { chartValues, signed } from './ProgressScreen';
import { bodyProgress, useProgressPeriod } from './series';

const methods: BfMethod[] = ['scale', 'calipers', 'tape'];

const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);

/** Body: weight (average, goal, entries), body fat and measurements, all on one page. */
export function BodyScreen() {
  const { t } = useTranslation();
  const barHeight = useTabBarHeight();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const { period } = useProgressPeriod();
  const entries = useBodyEntries();
  const goal = useBodyGoal();
  const save = useSaveCheckIn();
  const remove = useDeleteEntry();
  const setGoal = useSetBodyGoal();
  const showToast = useToastStore((s) => s.show);
  const lengthUnit = usePreferencesStore((s) => s.lengthUnit);
  const method = usePrivacyStore((s) => s.bodyFatMethod);
  const setMethod = usePrivacyStore((s) => s.set);
  const p = bodyProgress(entries.data ?? [], period, today);

  const b = p.bodyFat;
  const len = (cm: number) =>
    lengthUnit === 'cm'
      ? `${fmt(cm)} cm`
      : (() => {
          const x = cmToFeetInches(cm);
          return `${x.feet}′ ${x.inches}″`;
        })();

  const weights = (entries.data ?? []).filter((e) => e.weightKg != null);
  const latest = weights[weights.length - 1];
  const shown = (kg: number) => displayWeight(kg, unit);

  const [value, setValue] = useState<string | null>(null);
  const input = value ?? (latest ? String(shown(latest.weightKg!)) : '');
  const parsed = parseDecimal(input);
  const [goalSheet, setGoalSheet] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const target = goal.data?.targetWeightKg ?? null;
  const start = goal.data?.startWeightKg ?? weights[0]?.weightKg ?? null;
  const current = latest?.weightKg ?? null;
  const toGo = target != null && current != null ? Math.abs(current - target) : null;
  const progress =
    target != null && current != null && start != null ? goalProgress(start, current, target) : 0;

  const rows = [...weights].reverse().slice(0, 12);
  const dayLabel = (day: string) => {
    const r = relativeDay(day, today);
    return r.kind === 'today'
      ? t('common.today')
      : `${weekdayName(day).slice(0, 3)} ${shortDateLabel(day).split(' ')[1]} ${dayOfMonth(day)}`;
  };

  const submit = async () => {
    if (parsed == null || parsed <= 0) return;
    await save.mutateAsync({ day: today, weightKg: storedWeight(parsed, unit) });
    setValue(null);
    showToast({ message: t('progress.weightSaved') });
  };

  return (
    <>
      <Screen scroll bottomBarHeight={96} gap={14}>
        <TopBar
          onBack={() => goBack(router, '/progress')}
          backLabel={t('common.back')}
          right={
            <IconButton
              icon="plus"
              accessibilityLabel={t('progress.logMeasurements')}
              onPress={() => router.push('/check-in')}
            />
          }
        />
        <Text variant="screenTitle">{t('progress.bodyTitle')}</Text>

        <Text variant="label" muted>
          {t('progress.tabWeight')}
        </Text>
        <Card gap={12}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="displayL" numeric>
                {current != null ? shown(current) : '—'}
              </Text>
              <Text variant="label" muted>
                {latest?.day === today
                  ? t('progress.kgToday', { unit: unit.toUpperCase() })
                  : unit.toUpperCase()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {p.weight.deltaKg != null ? (
                <Text variant="label">{`${signed(shown(Math.abs(p.weight.deltaKg)) * Math.sign(p.weight.deltaKg))} ${unit.toUpperCase()}`}</Text>
              ) : null}
              {p.weight.sevenDayKg != null ? (
                <Text variant="label" muted>
                  {t('progress.sevenDay', { value: shown(p.weight.sevenDayKg) })}
                </Text>
              ) : null}
            </View>
          </View>
          {p.weight.buckets.some((v) => v != null) ? (
            <DotColumnChart
              values={chartValues(p.weight.buckets)}
              rows={8}
              stretch
              accessibilityLabel={t('progress.weightChart')}
            />
          ) : (
            <Text variant="bodyS" muted>
              {t('progress.weightEmpty')}
            </Text>
          )}
          <Text variant="bodyS" muted>
            {t('progress.weightExplain')}
          </Text>
        </Card>

        <Card size="small" gap={8}>
          {target != null && toGo != null ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label" muted>
                  {t('progress.goal', { value: shown(target), unit: unit.toUpperCase() })}
                </Text>
                <Text variant="label">
                  {t('progress.toGo', { value: fmt(shown(toGo)), unit: unit.toUpperCase() })}
                </Text>
              </View>
              <DotBar
                shape="segment"
                total={20}
                on={dotsOn(progress, 1, 20)}
                size={6}
                gap={3}
                accessibilityLabel={t('progress.goalBar')}
              />
            </>
          ) : null}
          <Button
            variant="ghost"
            label={target != null ? t('progress.changeGoal') : t('progress.setGoal')}
            onPress={() => {
              setGoalInput(target != null ? String(shown(target)) : '');
              setGoalSheet(true);
            }}
          />
        </Card>

        <Section title={t('progress.entries')}>
          {rows.map((e, i) => {
            const prev = rows[i + 1];
            const delta = prev ? e.weightKg! - prev.weightKg! : null;
            return (
              <View
                key={e.id}
                style={{
                  minHeight: 46,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.borderDecorative,
                }}
              >
                <Text variant="bodyS">{dayLabel(e.day)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {delta != null ? (
                    <Text variant="label" muted>
                      {signed(shown(Math.abs(delta)) * Math.sign(delta))}
                    </Text>
                  ) : null}
                  <Text variant="label">{`${shown(e.weightKg!)} ${unit}`}</Text>
                  <IconButton
                    icon="trash"
                    accessibilityLabel={t('progress.deleteEntry', { day: dayLabel(e.day) })}
                    onPress={() => {
                      remove.mutate({ id: e.id, deleted: true });
                      showToast({
                        message: t('progress.entryRemoved'),
                        actionLabel: t('common.undo'),
                        bottomOffset: barHeight + 80,
                        onAction: () => remove.mutate({ id: e.id, deleted: false }),
                      });
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Section>

        <Text variant="label" muted>
          {t('progress.tabFat')}
        </Text>
        <Card gap={12}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="displayL" numeric>
                {b.latestPct ?? '—'}
              </Text>
              <Text variant="label" muted>
                {'%'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {b.deltaPts != null ? (
                <Text variant="label">{t('progress.pts', { delta: signed(b.deltaPts) })}</Text>
              ) : null}
              <Text variant="label" muted>
                {t('progress.sinceDate', {
                  date: shortDateLabel(p.from).split(' ').slice(1).join(' '),
                })}
              </Text>
            </View>
          </View>
          {b.buckets.some((v) => v != null) ? (
            <DotColumnChart
              values={chartValues(b.buckets)}
              rows={8}
              stretch
              accessibilityLabel={t('progress.bodyFatChart')}
            />
          ) : (
            <Text variant="bodyS" muted>
              {t('progress.bodyFatEmpty')}
            </Text>
          )}
          {b.leanKg != null && b.fatKg != null ? (
            <View
              style={{
                flexDirection: 'row',
                borderTopWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.borderDecorative,
                paddingTop: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  variant="displayS"
                  numeric
                >{`${displayWeight(b.leanKg, unit)} ${unit.toUpperCase()}`}</Text>
                <Text variant="label" muted>
                  {t('progress.lean', {
                    delta: b.leanDelta != null ? ` · ${signed(b.leanDelta)}` : '',
                  })}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  variant="displayS"
                  numeric
                >{`${displayWeight(b.fatKg, unit)} ${unit.toUpperCase()}`}</Text>
                <Text variant="label" muted>
                  {t('progress.fat', {
                    delta: b.fatDelta != null ? ` · ${signed(b.fatDelta)}` : '',
                  })}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        <View style={{ gap: 10 }}>
          <Text variant="label" muted>
            {t('progress.measuredWith')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {methods.map((m) => (
              <Chip
                key={m}
                role="radio"
                label={t(`progress.method.${m}`)}
                selected={method === m}
                onPress={() => setMethod('bodyFatMethod', m as 'scale' | 'calipers' | 'tape')}
              />
            ))}
          </View>
        </View>

        <Section
          title={t('progress.measurements', {
            date: shortDateLabel(p.from).split(' ').slice(1).join(' '),
          })}
        >
          {measureKeys.map((k) => {
            const m = p.measures[k];
            return (
              <View
                key={k}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.borderDecorative,
                }}
              >
                <Text variant="bodyS">{t(`progress.measure.${k}`)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {m ? (
                    <>
                      <Text variant="label" muted>
                        {m.delta === 0 ? '0.0' : signed(m.delta)}
                      </Text>
                      <Text variant="label">{len(m.value)}</Text>
                    </>
                  ) : (
                    <Text variant="label" muted>
                      —
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </Section>
      </Screen>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.borderDecorative,
        }}
      >
        <View style={{ flex: 1 }}>
          <Input
            variant="compact"
            accessibilityLabel={t('progress.todayWeight', { unit })}
            value={input}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>
        <Button
          label={t('common.save')}
          block={false}
          disabled={parsed == null || parsed <= 0 || save.isPending}
          onPress={submit}
        />
      </View>

      <Sheet
        visible={goalSheet}
        onClose={() => setGoalSheet(false)}
        title={t('progress.setGoal')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('common.save')}
            disabled={parseDecimal(goalInput) == null}
            onPress={async () => {
              await setGoal.mutateAsync({
                day: today,
                startWeightKg: current,
                targetWeightKg: storedWeight(parseDecimal(goalInput)!, unit),
              });
              setGoalSheet(false);
            }}
          />
        }
      >
        <Input
          label={t('progress.goalWeight', { unit: unit.toUpperCase() })}
          value={goalInput}
          onChangeText={setGoalInput}
          keyboardType="decimal-pad"
          autoFocus
        />
      </Sheet>
    </>
  );
}
