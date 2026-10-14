import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
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
import { Sheet } from '@/components/ui/Sheet';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { dotsOn } from '@/domain/dots';
import { relativeDay, shortDateLabel, weekdayName, dayOfMonth } from '@/domain/day';
import { parseDecimal } from '@/domain/numbers';
import { goalProgress, goalStartValue } from '@/domain/progress';
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
  useSetBodyGoal,
  type BfMethod,
} from './data';
import { chartValues, signed } from './ProgressScreen';
import { bodyProgress, useProgressPeriod } from './series';

const methods: BfMethod[] = ['scale', 'calipers', 'tape'];
const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);

/** A number with its unit and how it changed, the way the top of the page reads at a glance. */
function Stat({
  label,
  value,
  unit,
  change,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  change: string | null;
  children?: ReactNode;
}) {
  return (
    <Card size="small" style={{ flex: 1 }} gap={10}>
      <Text variant="label" muted>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text variant="displayL" numeric>
          {value}
        </Text>
        <Text variant="label" muted>
          {unit}
        </Text>
      </View>
      <Text variant="label" muted={change == null}>
        {change ?? '—'}
      </Text>
      {children}
    </Card>
  );
}

/** Heading of a block of the page: what it is, and a hint of what it covers. */
function BlockTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ gap: 2, paddingTop: 6 }}>
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      {hint ? (
        <Text variant="bodyS" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Body: weight, body fat and measurements together, from the numbers to log today to the history. */
export function BodyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const lengthUnit = usePreferencesStore((s) => s.lengthUnit);
  const { period } = useProgressPeriod();
  const entries = useBodyEntries();
  const goal = useBodyGoal();
  const remove = useDeleteEntry();
  const setGoal = useSetBodyGoal();
  const method = usePrivacyStore((s) => s.bodyFatMethod);
  const setMethod = usePrivacyStore((s) => s.set);
  const showToast = useToastStore((s) => s.show);
  const p = bodyProgress(entries.data ?? [], period, today);
  const b = p.bodyFat;
  const u = unit;

  const shown = (kg: number) => displayWeight(kg, unit);
  const len = (cm: number) =>
    lengthUnit === 'cm'
      ? `${fmt(cm)} cm`
      : (() => {
          const x = cmToFeetInches(cm);
          return `${x.feet}′ ${x.inches}″`;
        })();

  const weights = (entries.data ?? []).filter((e) => e.weightKg != null);
  const latest = weights[weights.length - 1];
  const current = latest?.weightKg ?? null;
  const weightChange =
    p.weight.deltaKg != null
      ? `${signed(shown(Math.abs(p.weight.deltaKg)) * Math.sign(p.weight.deltaKg))} ${u}`
      : null;
  const fatChange = b.deltaPts != null ? t('progress.pts', { delta: signed(b.deltaPts) }) : null;

  const [goalSheet, setGoalSheet] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [fatGoalInput, setFatGoalInput] = useState('');

  const target = goal.data?.targetWeightKg ?? null;
  const fatTarget = goal.data?.targetBodyFatPct ?? null;
  const fatNow = b.latestPct;
  const fatStart = goal.data
    ? goalStartValue(
        (entries.data ?? []).map((e) => ({ day: e.day, value: e.bodyFatPct })),
        goal.data.validFrom,
      )
    : null;
  const fatToGo = fatTarget != null && fatNow != null ? Math.abs(fatNow - fatTarget) : null;
  const fatProgress =
    fatTarget != null && fatNow != null && fatStart != null
      ? goalProgress(fatStart, fatNow, fatTarget)
      : 0;
  const hasGoal = target != null || fatTarget != null;
  const openGoal = () => {
    setGoalInput(target != null ? String(shown(target)) : '');
    setFatGoalInput(fatTarget != null ? String(fatTarget) : '');
    setGoalSheet(true);
  };
  // Either field may stay empty, but what is typed must be a real value (DB ranges).
  const goalWeight = goalInput.trim() === '' ? null : parseDecimal(goalInput);
  const goalWeightKg = goalWeight != null ? storedWeight(goalWeight, unit) : null;
  const goalFat = fatGoalInput.trim() === '' ? null : parseDecimal(fatGoalInput);
  const weightBad =
    goalInput.trim() !== '' && (goalWeightKg == null || goalWeightKg < 20 || goalWeightKg > 500);
  const fatBad = fatGoalInput.trim() !== '' && (goalFat == null || goalFat < 2 || goalFat > 70);
  const canSaveGoal = !weightBad && !fatBad && (goalWeightKg != null || goalFat != null);
  const start = goal.data?.startWeightKg ?? weights[0]?.weightKg ?? null;
  const toGo = target != null && current != null ? Math.abs(current - target) : null;
  const progress =
    target != null && current != null && start != null ? goalProgress(start, current, target) : 0;

  const rows = [...weights].reverse().slice(0, 8);
  const dayLabel = (day: string) => {
    const r = relativeDay(day, today);
    return r.kind === 'today'
      ? t('common.today')
      : `${weekdayName(day).slice(0, 3)} ${shortDateLabel(day).split(' ')[1]} ${dayOfMonth(day)}`;
  };
  const since = shortDateLabel(p.from).split(' ').slice(1).join(' ');

  const divider = {
    borderTopWidth: 1,
    borderColor: colors.borderDecorative,
    paddingTop: 12,
  } as const;

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
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
        <View style={{ gap: 4 }}>
          <Text variant="label" muted>
            {t(`progress.periodLong.${period}`)}
          </Text>
          <Text variant="screenTitle">{t('progress.bodyTitle')}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat
            label={t('progress.tabWeight')}
            value={current != null ? String(shown(current)) : '—'}
            unit={u}
            change={weightChange}
          />
          <Stat
            label={t('progress.tabFat')}
            value={b.latestPct != null ? String(b.latestPct) : '—'}
            unit="%"
            change={fatChange}
          />
        </View>

        <BlockTitle title={t('progress.tabWeight')} hint={t('progress.weightExplain')} />
        <Card gap={14}>
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
          {p.weight.sevenDayKg != null ? (
            <Text variant="label" muted>
              {t('progress.sevenDay', { value: shown(p.weight.sevenDayKg) })}
            </Text>
          ) : null}
          <View style={[{ gap: 8 }, divider]}>
            {target != null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label" muted>
                  {t('progress.goal', { value: shown(target), unit: u })}
                </Text>
                {toGo != null ? (
                  <Text variant="label">
                    {t('progress.toGo', { value: fmt(shown(toGo)), unit: u })}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {target != null && toGo != null ? (
              <>
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
              label={hasGoal ? t('progress.changeGoal') : t('progress.setGoal')}
              onPress={openGoal}
            />
          </View>
        </Card>

        <BlockTitle title={t('progress.tabFat')} />
        <Card gap={14}>
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
            <View style={[{ flexDirection: 'row' }, divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="displayS" numeric>{`${displayWeight(b.leanKg, unit)} ${u}`}</Text>
                <Text variant="label" muted>
                  {t('progress.lean', {
                    delta: b.leanDelta != null ? ` · ${signed(b.leanDelta)}` : '',
                  })}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="displayS" numeric>{`${displayWeight(b.fatKg, unit)} ${u}`}</Text>
                <Text variant="label" muted>
                  {t('progress.fat', {
                    delta: b.fatDelta != null ? ` · ${signed(b.fatDelta)}` : '',
                  })}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={[{ gap: 8 }, divider]}>
            {fatTarget != null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label" muted>
                  {t('progress.goalFat', { value: Math.round(fatTarget * 10) / 10 })}
                </Text>
                {fatToGo != null ? (
                  <Text variant="label">{t('progress.toGoFat', { value: fmt(fatToGo) })}</Text>
                ) : null}
              </View>
            ) : null}
            {fatTarget != null && fatToGo != null ? (
              <>
                <DotBar
                  shape="segment"
                  total={20}
                  on={dotsOn(fatProgress, 1, 20)}
                  size={6}
                  gap={3}
                  accessibilityLabel={t('progress.goalFatBar')}
                />
              </>
            ) : null}
            <Button
              variant="ghost"
              label={hasGoal ? t('progress.changeGoal') : t('progress.setGoal')}
              onPress={openGoal}
            />
          </View>
          <View style={[{ gap: 10 }, divider]}>
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
        </Card>

        <BlockTitle title={t('progress.measurements', { date: since })} />
        {measureKeys.every((k) => !p.measures[k]) ? (
          <Card size="small" gap={8}>
            <Text variant="bodyS" muted>
              {t('progress.measurementsEmpty')}
            </Text>
            <Button
              variant="ghost"
              label={t('progress.logMeasurements')}
              onPress={() => router.push('/check-in')}
            />
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {measureKeys.map((k) => {
              const m = p.measures[k];
              return (
                <Card key={k} size="small" gap={6} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <Text variant="label" muted>
                    {t(`progress.measure.${k}`)}
                  </Text>
                  <Text variant="displayS" numeric>
                    {m ? len(m.value) : '—'}
                  </Text>
                  <Text variant="label" muted>
                    {m ? (m.delta === 0 ? '0.0' : signed(m.delta)) : ' '}
                  </Text>
                </Card>
              );
            })}
          </View>
        )}

        {rows.length > 0 ? (
          <>
            <BlockTitle title={t('progress.entries')} />
            <Card size="small" gap={0}>
              {rows.map((e, i) => {
                const prev = rows[i + 1];
                const delta = prev ? e.weightKg! - prev.weightKg! : null;
                return (
                  <View
                    key={e.id}
                    style={{
                      minHeight: 52,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTopWidth: i === 0 ? 0 : 1,
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
                            bottomOffset: barHeight,
                            onAction: () => remove.mutate({ id: e.id, deleted: false }),
                          });
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}
      </Screen>

      <Sheet
        visible={goalSheet}
        onClose={() => setGoalSheet(false)}
        title={t('progress.setGoal')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('common.save')}
            disabled={!canSaveGoal || setGoal.isPending}
            onPress={async () => {
              await setGoal.mutateAsync({
                day: today,
                startWeightKg: current,
                targetWeightKg: goalWeightKg,
                targetBodyFatPct: goalFat,
              });
              setGoalSheet(false);
            }}
          />
        }
      >
        <Text variant="bodyS" muted>
          {t('progress.goalHint')}
        </Text>
        <Input
          label={t('progress.goalWeight', { unit: u })}
          value={goalInput}
          onChangeText={setGoalInput}
          keyboardType="decimal-pad"
          error={weightBad ? t('progress.goalWeightError') : undefined}
          autoFocus
        />
        <Input
          label={t('progress.goalBodyFat')}
          value={fatGoalInput}
          onChangeText={setFatGoalInput}
          keyboardType="decimal-pad"
          error={fatBad ? t('progress.goalBodyFatError') : undefined}
        />
      </Sheet>
    </>
  );
}
