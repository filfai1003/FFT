import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { localDay } from '@/domain/day';
import { displayWeight, type WeightUnit } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { formatClock, trimNumber } from '@/features/session/logic';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { ExerciseThumb } from './exercise-image';
import { useExerciseTrend, useRecords } from './exercise-stats';
import { useExerciseSessions } from './history';
import { useDeleteExercise, useExercises, type Exercise } from './exercises';
import { goBack } from '@/lib/navigation';

type Metric = 'est1rm' | 'max';
const POINTS = 8;

export function ExerciseDetailScreen({
  exerciseId,
  sessionRoute,
  fromSession,
}: {
  exerciseId: string;
  sessionRoute: '/train/history/[sessionId]' | '/progress/history/[sessionId]';
  /** Id of the workout in progress this page was opened from: back returns to it. */
  fromSession?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const exercises = useExercises();
  const records = useRecords();
  const trend = useExerciseTrend(exerciseId);
  const sessions = useExerciseSessions(exerciseId);
  const timeZone = useProfile().data?.timezone ?? 'UTC';
  const remove = useDeleteExercise();
  const [metric, setMetric] = useState<Metric>('est1rm');
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exercise = exercises.data?.find((e) => e.id === exerciseId);
  const record = records.data?.get(exerciseId);
  const weighted = exercise?.logType === 'weight_reps';

  const series = (trend.data ?? [])
    .map((p) => ({ day: p.day, value: metric === 'est1rm' ? p.est1rmKg : p.maxKg }))
    .filter((p): p is { day: string; value: number } => p.value != null)
    .slice(-POINTS);
  const values = series.map((p) => displayWeight(p.value, unit));
  const delta =
    values.length >= 2 ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : null;

  if (!exercise) return <Screen>{null}</Screen>;

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <TopBar
          onBack={() =>
            fromSession
              ? router.dismissTo({
                  pathname: '/session/[sessionId]',
                  params: { sessionId: fromSession },
                })
              : goBack(
                  router,
                  sessionRoute.startsWith('/progress') ? '/progress' : '/train/library',
                )
          }
          backLabel={t('common.back')}
          right={
            exercise.ownerId ? (
              <IconButton
                icon="more"
                accessibilityLabel={t('exerciseDetail.more')}
                onPress={() => setMenu(true)}
              />
            ) : undefined
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <ExerciseThumb exercise={exercise} size={72} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="titleM" accessibilityRole="header">
              {exercise.name}
            </Text>
            <Text variant="label" muted style={{ lineHeight: 16 }}>
              {[exercise.primaryMuscle, ...exercise.secondaryMuscles, exercise.equipment]
                .join(' · ')
                .toUpperCase()}
            </Text>
          </View>
        </View>

        {weighted ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatCard
                label={t('exerciseDetail.actualMax')}
                value={
                  record?.actualMaxKg != null
                    ? String(displayWeight(record.actualMaxKg, unit))
                    : '—'
                }
                unit={unit.toUpperCase()}
                note={t('exerciseDetail.heaviest')}
              />
              <StatCard
                label={t('exerciseDetail.est1rm')}
                value={
                  record?.est1rmKg != null
                    ? String(Math.round(displayWeight(record.est1rmKg, unit)))
                    : '—'
                }
                unit={unit.toUpperCase()}
                note={t('exerciseDetail.epley')}
              />
            </View>

            <Card size="small" gap={12}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Segmented
                    accessibilityLabel={t('exerciseDetail.metric')}
                    value={metric}
                    onChange={setMetric}
                    options={[
                      { value: 'est1rm', label: t('exerciseDetail.metricEst') },
                      { value: 'max', label: t('exerciseDetail.metricMax') },
                    ]}
                  />
                </View>
              </View>
              {values.length >= 2 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.accent,
                      }}
                    />
                    <Text variant="label" muted>
                      {t('exerciseDetail.change', {
                        delta: `${delta! >= 0 ? '+' : '−'}${Math.abs(delta!)}`,
                        unit: unit.toUpperCase(),
                        count: values.length,
                      })}
                    </Text>
                  </View>
                  <DotColumnChart
                    values={values}
                    rows={10}
                    dotSize={7}
                    dotGap={3}
                    columnGap={6}
                    stretch
                    labels={values.map((v) => String(Math.round(v)))}
                    accessibilityLabel={t('exerciseDetail.chartLabel', {
                      from: Math.round(values[0]),
                      to: Math.round(values[values.length - 1]),
                      unit,
                    })}
                  />
                </>
              ) : (
                <Text variant="bodyS" muted>
                  {t('exerciseDetail.chartEmpty')}
                </Text>
              )}
            </Card>
          </>
        ) : (
          <Card size="small" gap={4}>
            <Text variant="label" muted>
              {t('exerciseDetail.best')}
            </Text>
            <Text variant="displayM" numeric>
              {exercise.logType === 'reps'
                ? (record?.bestReps ?? '—')
                : record?.bestDurationS != null
                  ? formatClock(record.bestDurationS)
                  : '—'}
            </Text>
          </Card>
        )}

        <Section title={t('exerciseDetail.recent')}>
          {sessions.data?.length ? (
            sessions.data.map((s) => (
              <ListRow
                key={s.id}
                title={`${formatSessionDate(s.startedAt, timeZone)}${s.name ? ` · ${s.name}` : ''}`}
                info={s.sets.map((x) => setLabel(exercise, x, unit)).join(' · ')}
                onPress={() => router.push({ pathname: sessionRoute, params: { sessionId: s.id } })}
              />
            ))
          ) : (
            <Text variant="bodyS" muted>
              {t('exerciseDetail.noSessions')}
            </Text>
          )}
        </Section>
      </Screen>

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={exercise.name}
        closeLabel={t('common.close')}
      >
        <Button
          label={t('exerciseDetail.edit')}
          variant="secondary"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: '/exercise/[exerciseId]', params: { exerciseId } });
          }}
        />
        <Button
          label={t('exerciseDetail.delete')}
          variant="danger"
          onPress={() => {
            setMenu(false);
            setConfirmDelete(true);
          }}
        />
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('exerciseDetail.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('exerciseDetail.deleteConfirm')}
            disabled={remove.isPending}
            onPress={async () => {
              await remove.mutateAsync(exerciseId);
              setConfirmDelete(false);
              goBack(router, sessionRoute.startsWith('/progress') ? '/progress' : '/train/library');
            }}
          />
        }
      >
        <Text muted>{t('exerciseDetail.deleteBody')}</Text>
      </Sheet>
    </>
  );
}

function StatCard({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <Card size="small" gap={6} style={{ flex: 1 }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="displayM" numeric>
          {value}
        </Text>
        <Text variant="label" muted>
          {unit}
        </Text>
      </View>
      <Text variant="label" muted>
        {note}
      </Text>
    </Card>
  );
}

/** "Thu Oct 1" from an instant, in the user's time zone. */
export function formatSessionDate(iso: string, timeZone: string): string {
  const day = localDay(new Date(iso), timeZone);
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "80×5" / "10" / "1:00" for one set of any kind of exercise. */
export function setLabel(
  e: Pick<Exercise, 'logType'>,
  s: {
    weight_kg: number | null;
    reps: number | null;
    duration_s: number | null;
    distance_m: number | null;
  },
  unit: WeightUnit,
): string {
  switch (e.logType) {
    case 'weight_reps':
      return `${trimNumber(displayWeight(Number(s.weight_kg ?? 0), unit))}×${s.reps ?? 0}`;
    case 'reps':
      return String(s.reps ?? 0);
    case 'time':
      return formatClock(s.duration_s ?? 0);
    default:
      return `${trimNumber(Number(s.distance_m ?? 0) / 1000)} km`;
  }
}
